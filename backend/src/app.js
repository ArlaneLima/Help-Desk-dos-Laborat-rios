const express = require('express');
const r = require('./regras');

const iniciadoEm = new Date().toISOString();

// sla_vencido calculado na consulta (RF6); o prazo em si e gravado na abertura (RF2)
const COLUNAS = `id, titulo, descricao, laboratorio, prioridade, status, solucao,
  aberto_em, prazo_sla, resolvido_em,
  (prazo_sla < now() AND status NOT IN ('resolvido','fechado')) AS sla_vencido`;

const h = (fn) => (req, res, next) => fn(req, res).catch(next);

function erroDeConexao(e) {
  const c = String(e.code || '');
  return ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET'].includes(c) ||
    c.startsWith('08') || c.startsWith('57P') || /timeout|terminated/i.test(e.message || '');
}

function criarApp(pool) {
  const app = express();
  app.use(express.json({ limit: '10kb' }));

  app.get('/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', banco: 'ok', iniciado_em: iniciadoEm });
    } catch {
      res.status(503).json({ status: 'erro', banco: 'indisponivel', iniciado_em: iniciadoEm });
    }
  });

  // RF1 + RF2
  app.post('/chamados', h(async (req, res) => {
    const { erros, dados } = r.validarNovoChamado(req.body);
    if (erros.length) return res.status(400).json({ erro: 'dados invalidos', detalhes: erros });

    const abertoEm = new Date();
    const prazo = r.calcularPrazo(abertoEm, dados.prioridade);
    const { rows } = await pool.query(
      `INSERT INTO chamados (titulo, descricao, laboratorio, prioridade, status, aberto_em, prazo_sla)
       VALUES ($1, $2, $3, $4, 'aberto', $5, $6) RETURNING ${COLUNAS}`,
      [dados.titulo, dados.descricao, dados.laboratorio, dados.prioridade, abertoEm, prazo]
    );
    res.status(201).json(rows[0]);
  }));

  // RF3: prioridade, depois antiguidade; filtro opcional por status
  app.get('/chamados', h(async (req, res) => {
    const { status } = req.query;
    if (status !== undefined && !r.STATUS.includes(status)) {
      return res.status(400).json({ erro: `status deve ser um de: ${r.STATUS.join(', ')}` });
    }
    const { rows } = await pool.query(
      `SELECT ${COLUNAS} FROM chamados
       WHERE ($1::text IS NULL OR status = $1::text)
       ORDER BY prioridade ASC, aberto_em ASC`,
      [status ?? null]
    );
    res.json(rows);
  }));

  app.get('/chamados/:id', h(async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ erro: 'id invalido' });
    const { rows } = await pool.query(`SELECT ${COLUNAS} FROM chamados WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ erro: 'chamado nao encontrado' });
    res.json(rows[0]);
  }));

  // RF4 + RF5 (regra central)
  app.patch('/chamados/:id/status', h(async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ erro: 'id invalido' });
    const { status: novo, solucao } = req.body || {};

    const atual = await pool.query('SELECT status FROM chamados WHERE id = $1', [req.params.id]);
    if (!atual.rows.length) return res.status(404).json({ erro: 'chamado nao encontrado' });

    const problema = r.validarMudancaStatus(atual.rows[0].status, novo, solucao);
    if (problema) return res.status(problema.codigo).json({ erro: problema.erro });

    // AND status = $4 evita corrida: se alguem mudou antes, nenhuma linha e atualizada
    const { rows } = await pool.query(
      `UPDATE chamados
          SET status = $1::text,
              solucao = COALESCE($2, solucao),
              resolvido_em = CASE WHEN $1::text = 'resolvido' THEN now() ELSE resolvido_em END
        WHERE id = $3 AND status = $4
        RETURNING ${COLUNAS}`,
      [novo, r.texto(solucao) || null, req.params.id, atual.rows[0].status]
    );
    if (!rows.length) return res.status(409).json({ erro: 'o chamado mudou de status; tente novamente' });
    res.json(rows[0]);
  }));

  app.use((req, res) => res.status(404).json({ erro: 'rota nao encontrada' }));

  // Nunca expoe detalhes internos
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON invalido' });
    if (err.type === 'entity.too.large') return res.status(400).json({ erro: 'corpo grande demais' });
    if (erroDeConexao(err)) return res.status(503).json({ erro: 'servico temporariamente indisponivel' });
    console.error(err);
    res.status(500).json({ erro: 'erro interno' });
  });

  return app;
}

module.exports = { criarApp };

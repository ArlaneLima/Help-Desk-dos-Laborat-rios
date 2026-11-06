// Testes da camada HTTP com um "banco" falso: validam o contrato (códigos e mensagens) sem Postgres.
const test = require('node:test');
const assert = require('node:assert');
const { criarApp } = require('../src/app');

async function comServidor(query, fn) {
  const srv = await new Promise((ok) => { const s = criarApp({ query }).listen(0, () => ok(s)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  const chamar = async (metodo, caminho, corpo) => {
    const r = await fetch(base + caminho, {
      method: metodo, headers: { 'content-type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    return { status: r.status, corpo: await r.json().catch(() => null) };
  };
  try { await fn(chamar); } finally { srv.closeAllConnections?.(); srv.close(); }
}
const semBanco = async () => { throw Object.assign(new Error('connect ECONNREFUSED 10.0.0.4:5432'), { code: 'ECONNREFUSED' }); };
const comStatus = (status) => async (sql) => (sql.startsWith('SELECT status') ? { rows: [{ status }] } : { rows: [{ id: 1, status }] });

test('POST /chamados válido -> 201 e prazo P1 = abertura + 4 h', async () => {
  let params;
  await comServidor(async (sql, p) => { params = p; return { rows: [{ id: 1 }] }; }, async (api) => {
    const r = await api('POST', '/chamados', { titulo: 'Projetor', descricao: 'Sem imagem no Lab 3', laboratorio: 'Lab 3', prioridade: 'P1' });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(params[5] - params[4], 4 * 3600e3);
  });
});

test('POST /chamados com prioridade P7 -> 400 (CA5)', async () => {
  await comServidor(semBanco, async (api) => {
    const r = await api('POST', '/chamados', { titulo: 'Teste', descricao: 'Prioridade errada', laboratorio: 'Lab 1', prioridade: 'P7' });
    assert.strictEqual(r.status, 400);
  });
});

test('PATCH aberto -> fechado direto -> 409 (CA1)', async () => {
  await comServidor(comStatus('aberto'), async (api) => {
    assert.strictEqual((await api('PATCH', '/chamados/1/status', { status: 'fechado' })).status, 409);
  });
});

test('PATCH em_atendimento -> resolvido sem solução -> 400 (CA2)', async () => {
  await comServidor(comStatus('em_atendimento'), async (api) => {
    assert.strictEqual((await api('PATCH', '/chamados/1/status', { status: 'resolvido' })).status, 400);
  });
});

test('PATCH em_atendimento -> resolvido com solução -> 200', async () => {
  await comServidor(comStatus('em_atendimento'), async (api) => {
    assert.strictEqual((await api('PATCH', '/chamados/1/status', { status: 'resolvido', solucao: 'Troquei o cabo HDMI' })).status, 200);
  });
});

test('chamado inexistente -> 404; id não numérico -> 400', async () => {
  await comServidor(async () => ({ rows: [] }), async (api) => {
    assert.strictEqual((await api('PATCH', '/chamados/99/status', { status: 'em_atendimento' })).status, 404);
    assert.strictEqual((await api('GET', '/chamados/abc')).status, 400);
  });
});

test('filtro de status inválido -> 400', async () => {
  await comServidor(semBanco, async (api) => {
    assert.strictEqual((await api('GET', '/chamados?status=zzz')).status, 400);
  });
});

test('banco fora do ar -> 503 sem detalhes internos', async () => {
  await comServidor(semBanco, async (api) => {
    const h = await api('GET', '/health');
    const l = await api('GET', '/chamados');
    assert.strictEqual(h.status, 503);
    assert.strictEqual(l.status, 503);
    assert.ok(!JSON.stringify([h.corpo, l.corpo]).includes('ECONNREFUSED'));
  });
});

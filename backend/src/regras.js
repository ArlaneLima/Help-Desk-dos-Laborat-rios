// Regras de negocio puras (sem banco), faceis de testar.
const HORAS_SLA = { P1: 4, P2: 8, P3: 24, P4: 72 };

// RF4: transicoes como dados. Validar vira uma linha.
const TRANSICOES = {
  aberto: ['em_atendimento'],
  em_atendimento: ['aberto', 'resolvido'],
  resolvido: ['fechado'],
  fechado: [],
};
const STATUS = Object.keys(TRANSICOES);

const texto = (v) => (typeof v === 'string' ? v.trim() : '');

// RF2: prazo = abertura + horas da prioridade
function calcularPrazo(abertoEm, prioridade) {
  return new Date(abertoEm.getTime() + HORAS_SLA[prioridade] * 3600 * 1000);
}

// RF1 + CA5
function validarNovoChamado(body) {
  const b = body && typeof body === 'object' ? body : {};
  const dados = {
    titulo: texto(b.titulo),
    descricao: texto(b.descricao),
    laboratorio: texto(b.laboratorio),
    prioridade: texto(b.prioridade).toUpperCase(),
  };
  const erros = [];
  if (dados.titulo.length < 3 || dados.titulo.length > 100) erros.push('titulo deve ter entre 3 e 100 caracteres');
  if (dados.descricao.length < 5 || dados.descricao.length > 1000) erros.push('descricao deve ter entre 5 e 1000 caracteres');
  if (dados.laboratorio.length < 1 || dados.laboratorio.length > 50) erros.push('laboratorio deve ter entre 1 e 50 caracteres');
  if (!Object.hasOwn(HORAS_SLA, dados.prioridade)) erros.push('prioridade deve ser P1, P2, P3 ou P4');
  return { erros, dados };
}

// RF4 + RF5 + CA1 + CA2. Retorna null se valido, ou { codigo, erro }.
function validarMudancaStatus(atual, novo, solucao) {
  if (!STATUS.includes(novo)) return { codigo: 400, erro: `status deve ser um de: ${STATUS.join(', ')}` };
  if (!TRANSICOES[atual].includes(novo)) return { codigo: 409, erro: `transicao ${atual} -> ${novo} nao permitida` };
  if (novo === 'resolvido' && texto(solucao).length < 3) {
    return { codigo: 400, erro: 'solucao e obrigatoria para marcar como resolvido' };
  }
  return null;
}

// RF6
function slaVencido(chamado, agora = new Date()) {
  const aberto = !['resolvido', 'fechado'].includes(chamado.status);
  return aberto && agora > new Date(chamado.prazo_sla);
}

module.exports = { HORAS_SLA, TRANSICOES, STATUS, texto, calcularPrazo, validarNovoChamado, validarMudancaStatus, slaVencido };

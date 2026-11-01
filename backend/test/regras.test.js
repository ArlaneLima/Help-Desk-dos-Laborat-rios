const test = require('node:test');
const assert = require('node:assert');
const r = require('../src/regras');

test('CA3: P1 aberto 19:00 -> prazo 23:00 do mesmo dia', () => {
  const prazo = r.calcularPrazo(new Date('2026-11-05T19:00:00Z'), 'P1');
  assert.strictEqual(prazo.toISOString(), '2026-11-05T23:00:00.000Z');
});

test('RF2: prazos P2=8h, P3=24h, P4=72h', () => {
  const base = new Date('2026-11-05T00:00:00Z');
  assert.strictEqual(r.calcularPrazo(base, 'P2') - base, 8 * 3600e3);
  assert.strictEqual(r.calcularPrazo(base, 'P3') - base, 24 * 3600e3);
  assert.strictEqual(r.calcularPrazo(base, 'P4') - base, 72 * 3600e3);
});

test('CA5: prioridade P7 -> erro (400)', () => {
  const { erros } = r.validarNovoChamado({ titulo: 'Projetor', descricao: 'Nao liga mais', laboratorio: 'Lab 2', prioridade: 'P7' });
  assert.ok(erros.some((e) => e.includes('prioridade')));
});

test('chamado valido nao gera erros', () => {
  const { erros } = r.validarNovoChamado({ titulo: 'Projetor', descricao: 'Nao liga mais', laboratorio: 'Lab 2', prioridade: 'p1' });
  assert.deepStrictEqual(erros, []);
});

test('CA1: aberto -> fechado direto -> 409', () => {
  assert.strictEqual(r.validarMudancaStatus('aberto', 'fechado').codigo, 409);
});

test('CA2: em_atendimento -> resolvido sem solucao -> 400', () => {
  assert.strictEqual(r.validarMudancaStatus('em_atendimento', 'resolvido', '').codigo, 400);
  assert.strictEqual(r.validarMudancaStatus('em_atendimento', 'resolvido').codigo, 400);
});

test('transicoes validas', () => {
  assert.strictEqual(r.validarMudancaStatus('aberto', 'em_atendimento'), null);
  assert.strictEqual(r.validarMudancaStatus('em_atendimento', 'aberto'), null);
  assert.strictEqual(r.validarMudancaStatus('em_atendimento', 'resolvido', 'Troquei o cabo'), null);
  assert.strictEqual(r.validarMudancaStatus('resolvido', 'fechado'), null);
});

test('status inexistente -> 400; fechado e final -> 409', () => {
  assert.strictEqual(r.validarMudancaStatus('aberto', 'xyz').codigo, 400);
  assert.strictEqual(r.validarMudancaStatus('fechado', 'aberto').codigo, 409);
});

test('RF6: SLA vencido so se nao resolvido/fechado', () => {
  const antigo = '2020-01-01T00:00:00Z';
  assert.strictEqual(r.slaVencido({ status: 'aberto', prazo_sla: antigo }), true);
  assert.strictEqual(r.slaVencido({ status: 'em_atendimento', prazo_sla: antigo }), true);
  assert.strictEqual(r.slaVencido({ status: 'resolvido', prazo_sla: antigo }), false);
  assert.strictEqual(r.slaVencido({ status: 'fechado', prazo_sla: antigo }), false);
  assert.strictEqual(r.slaVencido({ status: 'aberto', prazo_sla: '2999-01-01T00:00:00Z' }), false);
});

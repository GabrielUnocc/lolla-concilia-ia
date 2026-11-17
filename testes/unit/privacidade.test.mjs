import test from 'node:test';
import assert from 'node:assert/strict';
import { cenarioSicoob } from './_cenario.mjs';

test('payload da IA: só itens que precisam de interpretação, sem nome nem CPF/CNPJ', async () => {
  const { A, analise } = await cenarioSicoob();
  const p = A.privacidadeIa.montarPayload(analise);
  const esperados = analise.itens.filter((i) => i.precisaIa).map((i) => i.id);
  assert.deepEqual(p.ids, esperados);
  const json = JSON.stringify(p.partes);
  assert.doesNotMatch(json, /FICTICI/i);                 // nomes de clientes e pagadores
  assert.doesNotMatch(json, /\d{3}\.\d{3}\.\d{3}-\d{2}/);  // CPF
  assert.doesNotMatch(json, /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  assert.doesNotMatch(json, /"bruto"|"pessoais"|"conta"/);
  assert.match(json, /PIX RECEBIDO - \*\*\*/);
  assert.deepEqual(A.privacidadeIa.verificarPayload(p.partes, analise), { ok: true, problemas: [] });
});

test('a conferência final bloqueia o envio se um nome ou CPF escapar', async () => {
  const { A, analise } = await cenarioSicoob();
  const p = A.privacidadeIa.montarPayload(analise);
  p.partes[0].itens[0].linhas[0].observacao = 'cliente CLIENTE FICTICIO SETE 111.444.777-35';
  const v = A.privacidadeIa.verificarPayload(p.partes, analise);
  assert.equal(v.ok, false);
  assert.ok(v.problemas.some((x) => /CPF/.test(x)));
  assert.ok(v.problemas.some((x) => /nomes de clientes/.test(x)));
});

test('relatórios grandes são divididos em partes', async () => {
  const { A, analise } = await cenarioSicoob();
  const p = A.privacidadeIa.montarPayload(analise, { maxItensPorParte: 4 });
  assert.equal(p.partes.length, Math.ceil(p.totalItens / 4));
  assert.deepEqual(p.partes.map((x) => x.parte.de), p.partes.map(() => p.partes.length));
});

test('resposta da IA: linhas inventadas, item inexistente e certeza inválida são tratados', async () => {
  const { A, analise } = await cenarioSicoob();
  const parte = A.privacidadeIa.montarPayload(analise).partes[0];
  const [i1, i2] = parte.itens;
  const r = A.privacidadeIa.validarResposta({ itens: [
    { id: i1.id, causa_provavel: 'Baixa duplicada', linhas: [i1.linhas[0].ref, 'R:999'], explicacao: 'x', proximo_passo: 'Estornar', certeza: 'Média' },
    { id: 'Z-1', causa_provavel: 'inventado', linhas: [], proximo_passo: 'y', certeza: 'alta' },
    { id: i2.id, causa_provavel: 'Tarifa', linhas: [], proximo_passo: 'Perguntar', certeza: 'talvez', pergunta_ao_cliente: 'Qual a tarifa?' }
  ] }, parte);
  assert.equal(r.itens.length, 2);
  assert.deepEqual(r.itens[0].linhas, [i1.linhas[0].ref]);
  assert.equal(r.itens[0].certeza, 'media');
  assert.equal(r.itens[1].certeza, 'baixa');
  assert.ok(r.problemas.some((p) => /R:999/.test(p)));
  assert.ok(r.problemas.some((p) => /Z-1/.test(p)));
  assert.ok(r.problemas.some((p) => /não respondeu/.test(p)));
  assert.deepEqual(A.privacidadeIa.validarResposta({ nada: 1 }, parte).problemas.length, 1);
});

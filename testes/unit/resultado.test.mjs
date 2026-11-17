import test from 'node:test';
import assert from 'node:assert/strict';
import { cenarioSicoob } from './_cenario.mjs';

test('CSV: uma linha por registro de cada item, com classificação e referência de origem', async () => {
  const { A, analise } = await cenarioSicoob();
  const csv = A.resultado.csv(analise, { 'B-3': { causa_provavel: 'Tarifa descontada', certeza: 'media', proximo_passo: 'Lançar tarifa' } });
  assert.ok(csv.startsWith('﻿'));
  const linhas = csv.replace(/\r\n$/, '').split('\r\n');
  const total = analise.itens.reduce((a, i) => a + i.refs.francesinha.length + i.refs.ofx.length + i.refs.ixc.length, 0);
  assert.equal(linhas.length, total + 1);
  assert.match(linhas[0], /^﻿item;grupo;classificacao;status;etapa;regra/);
  const b3 = linhas.find((l) => l.startsWith('B-3;') && l.includes(';E:9;'));
  assert.match(b3, /;326,70;/);
  assert.match(b3, /Tarifa descontada;media;Lançar tarifa$/);
  const saida = linhas.find((l) => l.includes(';E:10;'));
  assert.match(saida, /;-350,00;/);                       // número negativo não vira texto
});

test('CSV neutraliza fórmulas em campos de texto', async () => {
  const { A, analise } = await cenarioSicoob();
  analise.registros.ofx[0].descricao = '=HYPERLINK("x")';
  assert.match(A.resultado.csv(analise), /'=HYPERLINK/);
});

test('texto para o chamado: banco, período, resumo, divergências e próximos passos', async () => {
  const { A, analise } = await cenarioSicoob();
  const t = A.resultado.textoChamado(analise);
  assert.match(t, /Banco: Sicoob \| Período: 03\/11\/2026 a 08\/11\/2026/);
  assert.match(t, /Conciliados: 11/);
  assert.match(t, /DIVERGÊNCIAS DE VALOR \(2\)/);
  assert.match(t, /SOMENTE NO IXC \(2\)/);
  assert.match(t, /PRÓXIMOS PASSOS/);
  assert.doesNotMatch(t, /CONCILIADOS \(/);               // conciliados não poluem o chamado
});

test('filtro por grupo e pesquisa por nosso número, valor e ref', async () => {
  const { A, analise } = await cenarioSicoob();
  assert.equal(A.resultado.filtrar(analise, { grupo: 'so_ixc' }).length, 2);
  assert.ok(A.resultado.filtrar(analise, { busca: '1007-6' }).every((i) => i.refs.francesinha.includes('F:7')));
  assert.ok(A.resultado.filtrar(analise, { busca: '326,70' }).some((i) => i.regra === 'B3'));
  assert.equal(A.resultado.filtrar(analise, { busca: 'R:18' }).length, 1);
});

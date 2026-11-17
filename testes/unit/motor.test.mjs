import test from 'node:test';
import assert from 'node:assert/strict';
import { carregar } from './_carregar.mjs';
import { cenarioSicoob, refsDo } from './_cenario.mjs';

// Gabarito do cenário fictício (testes/amostras/README.md): [regra, classificação, status, refs]
const GABARITO = [
  ['A1', 'conciliado', 'ok', ['F:1', 'R:3']],
  ['A1', 'valor', 'divergente', ['F:4', 'R:6']],                       // IXC baixou o valor original (sem mora)
  ['A1-dup', 'duplicado', 'divergente', ['F:7', 'R:10', 'R:9']],         // baixa duplicada no IXC
  ['A1', 'data', 'divergente', ['F:9', 'R:11']],                       // baixa em 06/11, pago 04/11, crédito 05/11
  ['A2', 'conciliado', 'ok', ['F:12', 'R:14']],                         // IXC com DV colado (10123)
  ['A3', 'conciliado', 'ok', ['F:5', 'R:7']],                           // seu número = ID do boleto
  ['B1', 'lote', 'ok', ['E:3', 'F:1', 'F:2', 'F:3', 'F:4', 'F:5']],
  ['B1', 'data', 'atencao', ['E:8', 'F:6', 'F:7', 'F:8', 'F:9']],       // lote veio em D+1
  ['B3', 'valor', 'divergente', ['E:9', 'F:10', 'F:11', 'F:12']],       // R$ 3,00 a menos (tarifa?)
  ['B-tarifa', 'tarifa', 'atencao', ['E:11']],
  ['C-valor-data', 'conciliado', 'ok', ['E:1', 'R:15']],
  ['C-ambiguo', 'sem_correspondencia', 'divergente', ['E:5', 'E:6', 'R:17']],
  ['C-lote', 'data', 'atencao', ['E:13', 'R:20', 'R:21']],
  ['D-ofx', 'duplicado', 'divergente', ['E:1', 'E:2']],
  ['D-so-banco-F', 'so_banco', 'divergente', ['E:8', 'F:8']],
  ['D-so-ixc', 'so_ixc', 'divergente', ['R:18']],
  ['D-so-ixc', 'so_ixc', 'divergente', ['R:19']],
  ['D-so-banco-E', 'so_banco', 'divergente', ['E:7']],
  ['D-saida', 'sem_correspondencia', 'fora_escopo', ['E:10']],
  ['D-so-banco-E', 'so_banco', 'divergente', ['E:12']]
];

test('cenário Sicoob: banco detectado e todas as linhas classificadas', async () => {
  const { deteccao, analise } = await cenarioSicoob();
  assert.equal(deteccao.id, 'sicoob');
  assert.deepEqual(analise.etapas, ['A', 'B', 'C', 'D']);
  assert.equal(analise.parcial, false);
  assert.deepEqual(analise.cobertura, { ok: true, faltando: [] });
  for (const [regra, cls, status, refs] of GABARITO) {
    const achado = analise.itens.find((i) => i.regra === regra && JSON.stringify(refsDo(i)) === JSON.stringify(refs.slice().sort()));
    assert.ok(achado, `faltou ${regra} ${refs.join(',')}`);
    assert.equal(achado.classificacao, cls, `${regra} ${refs}`);
    assert.equal(achado.status, status, `${regra} ${refs}`);
    assert.ok(achado.motivo && achado.motivo.length > 20, 'toda correspondência tem justificativa');
  }
  assert.equal(analise.resumo.correspondencias, 11);
  assert.equal(analise.resumo.porGrupo.conciliados, 11);
});

test('cenário Sicoob dá o mesmo resultado com CSV, XLSX, XLS e HTML', async () => {
  const base = (await cenarioSicoob('ixc-recebimentos.csv')).analise;
  for (const arq of ['ixc-recebimentos.xlsx', 'ixc-recebimentos.xls', 'ixc-recebimentos-html.xls']) {
    const a = (await cenarioSicoob(arq)).analise;
    const resumo = (an) => an.itens.map((i) => [i.regra, i.classificacao, refsDo(i).filter((r) => r[0] !== 'R').join(',')].join('|')).sort();
    assert.deepEqual(resumo(a), resumo(base), arq);
  }
});

test('A IA não decide pares: só itens sem explicação vão marcados para interpretação', async () => {
  const { analise } = await cenarioSicoob();
  analise.itens.filter((i) => i.status === 'ok').forEach((i) => assert.equal(i.precisaIa, false));
  assert.ok(analise.itens.find((i) => i.regra === 'B3').precisaIa);
  assert.equal(analise.itens.find((i) => i.regra === 'A1' && i.classificacao === 'valor').precisaIa, false);   // explicado pelo código
});

test('cada par francesinha × IXC mostra o crédito do OFX em que entrou', async () => {
  const { analise } = await cenarioSicoob();
  const a = analise.itens.find((i) => i.etapa === 'A' && i.refs.francesinha[0] === 'F:1');
  assert.deepEqual(a.contexto.ofx, ['E:3']);
});

function base() {
  const L = carregar(); const A = L.domain.analise;
  const f = (n, valor, pag, cred, extra = {}) => Object.assign({ ref: 'F:' + n, origem: 'francesinha', nossoNumero: String(1000 + n), nossoNumeroBruto: String(1000 + n), nossoNumeroSemUltimo: '', seuNumero: '',
    valorTitulo: valor, valorPago: valor, tarifa: null, dataPagamento: pag, dataCredito: cred }, extra);
  const e = (n, valor, data, descricao = 'CRED LIQUIDACAO COBRANCA', extra = {}) => Object.assign({ ref: 'E:' + n, origem: 'ofx', fitid: 'X' + n, data, valor, descricao, documento: '' }, extra);
  const r = (n, valor, data, nn, extra = {}) => Object.assign({ ref: 'R:' + n, origem: 'ixc', idRecebimento: String(n), idBoleto: '', nossoNumero: nn || '', nossoNumeroBruto: nn || '', nossoNumeroSemUltimo: '',
    valorRecebido: valor, dataPagamento: data, dataCredito: '', forma: '' }, extra);
  return { A, f, e, r };
}

test('crédito individual (regra do banco) e tarifa descontada conhecida', () => {
  const { A, f, e } = base();
  const banco = { id: 'x', nome: 'Banco X', regrasOfx: [], credito: { modo: 'individual', toleranciaDias: 1, tarifa: 'descontada' } };
  const F = [f(1, 10000, '2026-11-03', '2026-11-04', { tarifa: 200 }), f(2, 5000, '2026-11-03', '2026-11-04', { tarifa: 200 })];
  const E = [e(1, 9800, '2026-11-04'), e(2, 4800, '2026-11-05')];
  const an = A.motor.executar({ francesinha: F, ofx: E, ixc: null, banco });
  assert.deepEqual(an.etapas, ['B', 'D']);
  assert.equal(an.parcial, true);
  const i1 = an.itens.find((i) => i.refs.ofx[0] === 'E:1'), i2 = an.itens.find((i) => i.refs.ofx[0] === 'E:2');
  assert.equal(i1.regra, 'B2'); assert.equal(i1.classificacao, 'tarifa');
  assert.equal(i2.classificacao, 'data');                     // veio em D+1
  assert.ok(an.cobertura.ok);
});

test('lote com dois créditos no mesmo dia e tolerância de dias do banco', () => {
  const { A, f, e } = base();
  const banco = { id: 'x', nome: 'X', regrasOfx: [], credito: { modo: 'lote', toleranciaDias: 0, tarifa: 'separada' } };
  const F = [f(1, 1000, '2026-11-03', '2026-11-04'), f(2, 2000, '2026-11-03', '2026-11-04'), f(3, 500, '2026-11-04', '2026-11-05')];
  const E = [e(1, 1500, '2026-11-04'), e(2, 1500, '2026-11-04'), e(3, 500, '2026-11-06')];
  const an = A.motor.executar({ francesinha: F, ofx: E, ixc: null, banco });
  const lote = an.itens.find((i) => i.regra === 'B1');
  assert.deepEqual(lote.refs.ofx.sort(), ['E:1', 'E:2']);
  assert.equal(an.itens.find((i) => i.refs.francesinha.includes('F:3')).regra, 'B-sem');   // D+2 fora da tolerância 0
  assert.ok(an.itens.some((i) => i.refs.ofx.includes('E:3') && i.classificacao === 'so_banco'));
});

test('análise parcial francesinha × IXC (sem OFX) e OFX × IXC (sem francesinha)', () => {
  const { A, f, e, r } = base();
  const sicoob = A.bancos.obter('sicoob');
  let an = A.motor.executar({ francesinha: [f(1, 1000, '2026-11-03', '2026-11-04')], ofx: null, ixc: [r(1, 1000, '2026-11-03', '1001'), r(2, 700, '2026-11-03', '1077')], banco: sicoob });
  assert.deepEqual(an.etapas, ['A', 'D']);
  assert.equal(an.itens.find((i) => i.regra === 'A1').status, 'ok');
  assert.equal(an.itens.find((i) => i.refs.ixc[0] === 'R:2').classificacao, 'so_ixc');
  an = A.motor.executar({ francesinha: null, ofx: [e(1, 1000, '2026-11-04', 'PIX RECEBIDO')], ixc: [r(1, 1000, '2026-11-03')], banco: sicoob });
  assert.deepEqual(an.etapas, ['C', 'D']);
  assert.equal(an.itens[0].classificacao, 'data');
  assert.ok(an.cobertura.ok);
});

test('nosso número repetido na francesinha = pago duas vezes', () => {
  const { A, f, r } = base();
  const F = [f(1, 1000, '2026-11-03', '2026-11-04'), f(2, 1000, '2026-11-03', '2026-11-04', { nossoNumero: '1001' })];
  const an = A.motor.executar({ francesinha: F, ofx: null, ixc: [r(1, 1000, '2026-11-03', '1001')], banco: A.bancos.obter('sicoob') });
  const d = an.itens.find((i) => i.classificacao === 'duplicado');
  assert.equal(d.titulo, 'Título pago mais de uma vez no banco');
});

test('5 mil linhas cruzadas em menos de 10 s', () => {
  const { A, f, e, r } = base();
  const F = [], E = [], R = [];
  const dias = ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'];
  for (let k = 1; k <= 2000; k++) {
    const d = dias[k % 5], c = dias[(k % 5) + 1 > 4 ? 4 : (k % 5) + 1];
    const v = 5000 + (k % 37) * 100;
    F.push(f(k, v, d, c));
    if (k % 50 !== 0) R.push(r(k, v, d, String(1000 + k)));
  }
  dias.forEach((d, i) => {
    const tot = F.filter((x) => x.dataCredito === d).reduce((a, x) => a + x.valorPago, 0);
    if (tot) E.push(e(i + 1, tot, d));
  });
  for (let k = 1; k <= 1000; k++) { E.push(e(100 + k, 3000 + (k % 13) * 100, dias[k % 5], 'PIX RECEBIDO')); R.push(r(5000 + k, 3000 + (k % 13) * 100, dias[k % 5])); }
  const t = performance.now();
  const an = A.motor.executar({ francesinha: F, ofx: E, ixc: R, banco: A.bancos.obter('sicoob') });
  const ms = performance.now() - t;
  assert.ok(an.cobertura.ok);
  assert.ok(F.length + E.length + R.length >= 5000);
  assert.ok(ms < 10000, `levou ${ms.toFixed(0)} ms`);
  console.log(`  ${F.length + E.length + R.length} linhas em ${ms.toFixed(0)} ms`);
});

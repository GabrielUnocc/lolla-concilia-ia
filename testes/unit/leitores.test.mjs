import test from 'node:test';
import assert from 'node:assert/strict';
import { carregar, ler } from './_carregar.mjs';

const A = carregar().domain.analise;
const sicoob = A.bancos.obter('sicoob');
const paginas = JSON.parse(ler('testes/amostras/sicoob-francesinha.itens.json'));

test('francesinha Sicoob (PDF com texto): 12 títulos em 2 páginas, campos normalizados', () => {
  const r = A.leitorFrancesinha.interpretar(paginas, sicoob.francesinha, 'f.pdf');
  assert.equal(r.registros.length, 12);
  assert.equal(r.ignoradas.length, 0);
  assert.deepEqual(r.periodo, { inicio: '2026-11-03', fim: '2026-11-05' });
  assert.equal(r.conferencia.confere, true);
  const t = r.registros.find((x) => x.nossoNumeroBruto === '1004-1');
  assert.equal(t.nossoNumero, '1004');
  assert.equal(t.valorTitulo, 13990); assert.equal(t.valorPago, 14990); assert.equal(t.mora, 1000);
  assert.equal(t.dataPagamento, '2026-11-03'); assert.equal(t.dataCredito, '2026-11-04'); assert.equal(t.vencimento, '2026-10-28');
  assert.equal(t.tarifa, null);                       // Sicoob não informa tarifa por título: fica nulo, não zero
  assert.equal(t.seuNumero, '50004');
  assert.equal(t.pagina, 1);
  assert.equal(r.registros[11].pagina, 2);            // cabeçalho repetido na 2ª página
  assert.ok(!('sacado' in t));                         // nome não vira campo de dado
});

test('francesinha escaneada (sem texto) é recusada com mensagem clara', () => {
  const vazio = JSON.parse(ler('testes/amostras/francesinha-escaneada.itens.json'));
  assert.throws(() => A.leitorFrancesinha.interpretar(vazio, sicoob.francesinha), (e) => e.codigo === 'sem_texto' && /OCR/.test(e.message));
  assert.throws(() => A.leitorFrancesinha.textoCorrido(vazio), (e) => e.codigo === 'sem_texto');
});

test('francesinha de banco ainda sem leitor e layout não reconhecido', () => {
  assert.throws(() => A.leitorFrancesinha.interpretar(paginas, null), (e) => e.codigo === 'sem_layout');
  const outro = { colunas: ['Pagador', 'Identificador', 'Data Crédito', 'Valor Líquido'], campos: { nossoNumero: 'Identificador', valorPago: 'Valor Líquido', dataCredito: 'Data Crédito' } };
  assert.throws(() => A.leitorFrancesinha.interpretar(paginas, outro), (e) => e.codigo === 'layout_nao_reconhecido');
});

test('linha de título incompleta não some: vai para "ignoradas"', () => {
  const copia = JSON.parse(JSON.stringify(paginas));
  const linhaY = copia[0].find((it) => it.str === '1002-5').y;
  copia[0] = copia[0].filter((it) => !(it.y === linhaY && /,\d{2}$/.test(it.str) && it.x > 740));   // apaga o Vlr. Cobrado do título 1002
  const r = A.leitorFrancesinha.interpretar(copia, sicoob.francesinha);
  assert.equal(r.registros.length, 11);
  assert.equal(r.ignoradas.length, 1);
  assert.match(r.ignoradas[0].motivo, /valor pago/);
  assert.ok(r.avisos.some((a) => a.tipo === 'linhas_incompletas'));
});

test('OFX: 13 lançamentos, charset 1252, FITID repetido avisado', () => {
  const r = A.leitorOfx.ler(new TextDecoder('windows-1252').decode(ler('testes/amostras/sicoob-extrato.ofx')), 'x.ofx');
  assert.equal(r.registros.length, 13);
  assert.equal(r.conta.bancoCodigo, '756');
  const e = r.registros[2];
  assert.deepEqual([e.ref, e.data, e.valor, e.fitid, e.descricao, e.tipo], ['E:3', '2026-11-04', 54950, 'F0002', 'CRÉD.LIQUIDAÇÃO COBRANÇA', 'CREDIT']);
  assert.equal(r.registros[9].valor, -35000);
  assert.ok(r.avisos.some((a) => a.tipo === 'fitid_repetido'));
  assert.throws(() => A.leitorOfx.ler('isto não é ofx'), /OFX/);
});

for (const arq of ['ixc-recebimentos.csv', 'ixc-recebimentos.xlsx', 'ixc-recebimentos.xls', 'ixc-recebimentos-html.xls']) {
  test(`recebimentos IXC (${arq}): cabeçalho achado, colunas mapeadas e 19 registros iguais`, async () => {
    const pl = await A.planilha.ler(ler('testes/amostras/' + arq), arq);
    const r = A.leitorRecebimentos.interpretar(pl.abas[0].linhas, {}, arq);
    assert.equal(r.status, 'ok', r.mensagem);
    assert.equal(r.registros.length, 19);
    const cab = (campo) => r.cabecalho[r.mapa[campo]];
    assert.equal(cab('nossoNumero'), 'Nosso Número');
    assert.equal(cab('valorRecebido'), 'Valor Recebido');
    assert.equal(cab('dataPagamento'), 'Data Pagamento');
    assert.equal(cab('idBoleto'), 'ID Boleto');
    assert.equal(cab('idRecebimento'), 'ID');
    assert.deepEqual(r.pessoais.map((k) => r.cabecalho[k]), ['Cliente', 'CPF/CNPJ']);
    assert.ok(!Object.values(r.mapa).some((k) => r.pessoais.includes(k)));
    const x = r.registros.find((y) => y.idRecebimento === '9004');
    assert.deepEqual([x.nossoNumero, x.idBoleto, x.valorRecebido, x.dataPagamento, x.forma], ['1004', '50004', 13990, '2026-11-03', 'Boleto']);
    assert.equal(r.registros.find((y) => y.idRecebimento === '9012').nossoNumeroSemUltimo, '1012');
  });
}

test('recebimentos: mapeamento manual e mapeamento incompleto', async () => {
  const pl = await A.planilha.ler(ler('testes/amostras/ixc-recebimentos.csv'), 'r.csv');
  const linhas = pl.abas[0].linhas;
  const auto = A.leitorRecebimentos.interpretar(linhas);
  const manual = A.leitorRecebimentos.interpretar(linhas, { linhaCabecalho: auto.linhaCabecalho, mapa: Object.assign({}, auto.mapa, { valorRecebido: 7 }) });
  assert.equal(manual.registros.find((y) => y.idRecebimento === '9004').valorRecebido, 13990);   // Valor Original
  const semValor = A.leitorRecebimentos.interpretar(linhas, { linhaCabecalho: auto.linhaCabecalho, mapa: { nossoNumero: 4, dataPagamento: 6 } });
  assert.equal(semValor.status, 'mapeamento_incompleto');
  assert.match(semValor.mensagem, /Valor recebido/);
  const nada = A.leitorRecebimentos.interpretar([['a', 'b'], ['1', '2']]);
  assert.equal(nada.status, 'sem_cabecalho');
});

test('recebimentos: linhas inválidas avisadas e filtro de conta contado', () => {
  const linhas = [['Nosso número', 'Valor recebido', 'Data pagamento', 'Conta'], ['10', '10,00', '01/11/2026', 'A'], ['11', 'xx', '01/11/2026', 'A'], ['12', '5,00', '01/11/2026', 'B']];
  const r = A.leitorRecebimentos.interpretar(linhas);
  assert.equal(r.registros.length, 2);
  assert.equal(r.ignoradas.length, 1);
  assert.ok(r.avisos.some((a) => a.tipo === 'varias_contas'));
  const f = A.leitorRecebimentos.interpretar(linhas, { conta: 'A' });
  assert.equal(f.registros.length, 1);
  assert.ok(f.avisos.some((a) => a.tipo === 'filtro_conta'));
  assert.deepEqual(f.contas.sort(), ['A', 'B']);
});

test('CSV com aspas, separador vírgula e quebra de linha no campo', () => {
  const r = A.planilha.lerCsv('a,b,c\n"1,5","x ""y""","li\nnha"\n');
  assert.equal(r.separador, ',');
  assert.deepEqual(r.linhas[1], ['1,5', 'x "y"', 'li\nnha']);
});

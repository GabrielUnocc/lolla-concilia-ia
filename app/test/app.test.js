import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'concilia-test-'));
const { abrirBanco } = await import('../lib/db.js');
const { gerarHash } = await import('../lib/senha.js');
const { criarApp } = await import('../server.js');
const { paraCentavos, paraISO, normalizarDados } = await import('../lib/dados.js');

const exemplo = JSON.parse(readFileSync(new URL('../public/exemplos/conciliacao-exemplo.json', import.meta.url)));

test('converte valores e datas no formato brasileiro', () => {
  assert.equal(paraCentavos('60,00'), 6000);
  assert.equal(paraCentavos('1.234,5'), 123450);
  assert.equal(paraCentavos('0'), 0);
  assert.equal(paraCentavos('-2,90'), -290);
  assert.equal(paraCentavos(89.9), 8990);
  assert.equal(paraCentavos('R$ 10,00'), 1000);
  assert.throws(() => paraCentavos('abc'));
  assert.equal(paraISO('02/11/2026'), '2026-11-02');
  assert.equal(paraISO('2026-11-02'), '2026-11-02');
  assert.throws(() => paraISO('31/02/2026'));
});

test('lê o JSON de exemplo e confere os totais da tela', () => {
  const { dados, avisos, sugestao } = normalizarDados(exemplo);
  assert.equal(dados.movimentacao.length, 13);
  assert.equal(dados.extrato.length, 10);
  assert.deepEqual(avisos, []);
  assert.equal(sugestao.data_inicial, '2026-11-01');
});

test('aceita campos com prefixo abbr e avisa quando o total da tela não bate', () => {
  const { dados, avisos } = normalizarDados({
    movimentacao: [{ 'fn_movim_finan.id': '1', 'fn_movim_finan.data': '02/11/2026', 'fn_movim_finan.credito': '60,00' }],
    extrato: [],
    totais: { total_a_conciliar_aba3_mov: '70,00' },
  });
  assert.equal(dados.movimentacao[0].credito, 6000);
  assert.equal(avisos.length, 1);
});

test('aceita o formato da extensão Leitor de Conciliacao IXC', () => {
  const linha = (pref, tipo, id, valor, conc = 'fa fa-times') => ({
    tipo_linha: tipo,
    campos: { [`${pref}.id`]: id, [`${pref}.conciliado`]: conc, [`${pref}.data`]: '15/09/2026', [`${pref}.documento`]: '-',
      [`${pref}.credito`]: valor, [`${pref}.debito`]: '0,00', [`${pref}.historico`]: '-', [`${pref}.tx_id`]: '' },
  });
  const { dados, avisos, sugestao } = normalizarDados({
    _meta: { capturado_em: '2026-11-05' },
    resumo_valores: { conta_label: 'Banco X', periodo_inicial: '01/09/2026', periodo_final: '30/09/2026', lote_id: '210' },
    grid_esquerda_ixc: { linhas: [linha('fn_movim_finan', 'agrupador_data', '10', '1.100,00'), linha('fn_movim_finan', 'lancamento', '10', '1.000,00'), linha('fn_movim_finan', 'lancamento', '11', '100,00', 'fa fa-check')] },
    grid_direita_extrato: { linhas: [linha('fn_extrato', 'agrupador_data', '', '1.000,00'), linha('fn_extrato', 'lancamento', '7', '1.000,00')] },
    totais_rodape: [{ id: 'total_a_conciliar_aba3_mov', value: '1.000,00' }, { id: 'total_a_conciliar_aba3_ext', value: '1.000,00' }],
  });
  assert.equal(dados.movimentacao.length, 2);
  assert.equal(dados.extrato.length, 1);
  assert.equal(dados.movimentacao[0].documento, '');
  assert.equal(dados.movimentacao[1].conciliado, true);
  assert.deepEqual(avisos, []);
  assert.equal(sugestao.conta, 'Banco X');
  assert.equal(dados.origem.lote_id, '210');
});

test('fluxo completo pela API', async (t) => {
  const db = abrirBanco(':memory:');
  db.prepare('INSERT INTO usuarios (email, nome, senha_hash) VALUES (?, ?, ?)').run('teste@exemplo.com', 'Teste', gerarHash('senha-de-teste-123'));
  const srv = createServer(criarApp(db)).listen(0);
  t.after(() => srv.close());
  const base = `http://127.0.0.1:${srv.address().port}`;
  let cookie = '';
  const req = async (metodo, caminho, corpo) => {
    const r = await fetch(base + caminho, {
      method: metodo,
      headers: { ...(corpo ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
      redirect: 'manual',
    });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const tipo = r.headers.get('content-type') || '';
    return { status: r.status, corpo: tipo.includes('json') ? await r.json() : await r.text(), headers: r.headers };
  };

  assert.equal((await req('GET', '/api/conciliacoes')).status, 401);
  assert.equal((await req('GET', '/')).status, 302);
  assert.equal((await req('POST', '/api/login', { email: 'teste@exemplo.com', senha: 'errada' })).status, 401);
  assert.equal((await req('POST', '/api/login', { email: 'TESTE@exemplo.com', senha: 'senha-de-teste-123' })).status, 200);
  assert.equal((await req('GET', '/')).status, 200);

  const ruim = await req('POST', '/api/conciliacoes', { conta: 'X', data_inicial: '2026-11-03', data_final: '2026-11-01', dados: exemplo });
  assert.equal(ruim.status, 422);

  const criada = await req('POST', '/api/conciliacoes', {
    conta: 'Sicoob 0001', data_inicial: '2026-11-01', data_final: '2026-11-02', dados: exemplo,
    francesinha: { nome: 'francesinha.csv', tipo: 'text/csv', base64: Buffer.from('doc;valor\n7179140;85,00').toString('base64') },
  });
  assert.equal(criada.status, 201);
  assert.ok(criada.corpo.avisos.some((a) => a.includes('fora do período')));
  const cid = criada.corpo.id;

  const c = await req('GET', `/api/conciliacoes/${cid}`);
  assert.equal(c.corpo.resumo.diferenca, 9500);
  assert.equal(c.corpo.francesinha_arquivo, undefined);

  // Lote: 3 recebimentos do IXC = 1 crédito de 300,00
  assert.equal((await req('POST', `/api/conciliacoes/${cid}/vinculos`, { ixc: ['131370', '131371'], ext: ['905'] })).status, 422);
  const v = await req('POST', `/api/conciliacoes/${cid}/vinculos`, { ixc: ['131370', '131371', '131372'], ext: ['905'] });
  assert.equal(v.status, 201);
  assert.equal((await req('POST', `/api/conciliacoes/${cid}/vinculos`, { ixc: ['131402'], ext: ['905'] })).status, 422);

  const lista = await req('GET', '/api/conciliacoes');
  assert.equal(lista.corpo[0].resumo.vinculos, 1);
  assert.equal(lista.corpo[0].resumo.diferenca, 9500);
  assert.equal(lista.corpo[0].resumo.pendentes_ixc, 3);

  const fr = await req('GET', `/api/conciliacoes/${cid}/francesinha`);
  assert.equal(fr.status, 200);
  assert.match(fr.corpo, /7179140/);

  // Lote de pares: tudo ou nada
  const loteRuim = await req('POST', `/api/conciliacoes/${cid}/vinculos/lote`, { pares: [{ ixc: ['131402'], ext: ['907'] }, { ixc: ['131409'], ext: ['907'] }] });
  assert.equal(loteRuim.status, 422);
  assert.match(loteRuim.corpo.erro, /mais de um par/);
  const naoBate = await req('POST', `/api/conciliacoes/${cid}/vinculos/lote`, { pares: [{ ixc: ['131402'], ext: ['907'] }, { ixc: ['131377'], ext: ['908'] }] });
  assert.equal(naoBate.status, 422);
  assert.equal((await req('GET', `/api/conciliacoes/${cid}`)).corpo.vinculos.length, 1); // nada gravado
  const lote = await req('POST', `/api/conciliacoes/${cid}/vinculos/lote`, { pares: [{ ixc: ['131402'], ext: ['907'] }] });
  assert.equal(lote.status, 201);
  assert.equal(lote.corpo.ids.length, 1);
  assert.equal((await req('GET', `/api/conciliacoes/${cid}`)).corpo.resumo.diferenca, 9500 - 0);

  assert.equal((await req('DELETE', `/api/conciliacoes/${cid}/vinculos/${v.corpo.id}`)).status, 200);
  assert.equal((await req('GET', '/../server.js')).status, 404);
  assert.equal((await req('POST', '/api/logout', {})).status, 200);
  assert.equal((await req('GET', `/api/conciliacoes/${cid}`)).status, 401);
});

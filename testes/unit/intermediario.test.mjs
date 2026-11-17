// Intermediário local: chave só no servidor, conferência de dados pessoais, limites e custo real.
// A API do Claude é substituída por um servidor local de teste (nada sai da máquina).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cenarioSicoob } from './_cenario.mjs';

let recebido = null;
const falsaApi = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    recebido = { headers: req.headers, corpo: JSON.parse(corpo) };
    const ids = JSON.parse(recebido.corpo.messages[0].content.split('\n').slice(1).join('\n')).itens.map((i) => i.id);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ model: recebido.corpo.model, stop_reason: 'end_turn', usage: { input_tokens: 2000, output_tokens: 500 },
      content: [{ type: 'text', text: '```json\n' + JSON.stringify({ itens: ids.map((id) => ({ id, causa_provavel: 'teste', linhas: [], explicacao: '', proximo_passo: 'conferir', certeza: 'baixa', pergunta_ao_cliente: '' })), observacoes_gerais: '' }) + '\n```' }] }));
  });
});

async function subir(env) {
  Object.assign(process.env, { LOLLA_DADOS: mkdtempSync(path.join(os.tmpdir(), 'lolla-')), ANTHROPIC_API_KEY: '', LOLLA_LIMITE_ANALISE_REAIS: '', LOLLA_LIMITE_DIA_REAIS: '' }, env);
  const m = await import('../../intermediario/servidor.mjs?v=' + Math.random());
  const srv = m.criarServidor();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { srv, base, dados: process.env.LOLLA_DADOS };
}
const fechar = (srv) => { srv.closeAllConnections(); srv.close(); };
const post = (base, corpo, origem = 'null') => fetch(base + '/v1/interpretar', { method: 'POST', headers: { 'content-type': 'application/json', origin: origem }, body: JSON.stringify(corpo) });

test.before(() => new Promise((r) => falsaApi.listen(0, '127.0.0.1', r)));
test.after(() => { falsaApi.closeAllConnections(); falsaApi.close(); });

test('sem chave: status indisponível e consulta recusada (nada é simulado)', async () => {
  const { srv, base } = await subir({});
  const st = await (await fetch(base + '/v1/status')).json();
  assert.equal(st.disponivel, false);
  assert.match(st.motivo, /ANTHROPIC_API_KEY/);
  assert.equal(st.modelos.find((m) => m.padrao).id, 'claude-haiku-5-5');
  assert.equal(st.modelos.find((m) => /opus/.test(m.id)).habilitado, false);
  const { A, analise } = await cenarioSicoob();
  const parte = A.privacidadeIa.montarPayload(analise).partes[0];
  const r = await post(base, { modelo: 'claude-haiku-5-5', analiseId: 'teste-123', payload: parte });
  assert.equal(r.status, 503);
  fechar(srv);
});

test('com chave: chama a API, devolve resultado e custo real, registra uso sem conteúdo', async () => {
  const { srv, base, dados } = await subir({ ANTHROPIC_API_KEY: 'sk-teste-nao-real', ANTHROPIC_BASE_URL: `http://127.0.0.1:${falsaApi.address().port}` });
  const { A, analise } = await cenarioSicoob();
  const parte = A.privacidadeIa.montarPayload(analise).partes[0];
  const r = await post(base, { modelo: 'claude-sonnet-5-5', analiseId: 'analise-abc', payload: parte });
  const corpo = await r.json();
  assert.equal(r.status, 200, JSON.stringify(corpo));
  assert.equal(r.headers.get('access-control-allow-origin'), 'null');
  assert.equal(recebido.headers['x-api-key'], 'sk-teste-nao-real');            // a chave só existe entre intermediário e API
  assert.doesNotMatch(JSON.stringify(corpo), /sk-teste/);
  assert.match(recebido.corpo.system, /Não refaça o pareamento/);
  assert.doesNotMatch(JSON.stringify(recebido.corpo), /FICTICI|\d{3}\.\d{3}\.\d{3}-\d{2}/);
  assert.equal(corpo.resultado.itens.length, parte.itens.length);
  assert.equal(corpo.custoReais, Number((((2000 * 2 + 500 * 10) / 1e6) * 5.5).toFixed(6)));   // Sonnet: US$ 2 / US$ 10 por milhão
  const uso = JSON.parse(readFileSync(path.join(dados, 'uso.json'), 'utf8'));
  assert.ok(Object.values(uso.dias)[0].consultas === 1);
  const log = readFileSync(path.join(dados, 'uso.log'), 'utf8');
  assert.doesNotMatch(log, /PIX|F:\d|E:\d|nosso/);                                 // registro sem conteúdo
  fechar(srv);
});

test('bloqueios: dado pessoal, modelo não liberado, limite por análise e origem estranha', async () => {
  const { srv, base } = await subir({ ANTHROPIC_API_KEY: 'sk-x', ANTHROPIC_BASE_URL: `http://127.0.0.1:${falsaApi.address().port}`, LOLLA_LIMITE_ANALISE_REAIS: '0.0001' });
  const { A, analise } = await cenarioSicoob();
  const parte = A.privacidadeIa.montarPayload(analise).partes[0];
  const comCpf = JSON.parse(JSON.stringify(parte)); comCpf.itens[0].linhas[0].obs = '111.444.777-35';
  let r = await post(base, { modelo: 'claude-haiku-5-5', analiseId: 'analise-x1', payload: comCpf });
  assert.equal(r.status, 422); assert.match((await r.json()).motivo, /CPF/);
  r = await post(base, { modelo: 'claude-opus-5-5', analiseId: 'analise-x1', payload: parte });
  assert.equal(r.status, 400);
  r = await post(base, { modelo: 'claude-haiku-5-5', analiseId: 'analise-x1', payload: parte });
  assert.equal(r.status, 402); assert.match((await r.json()).motivo, /Limite por análise/);
  r = await post(base, { modelo: 'claude-haiku-5-5', analiseId: 'analise-x1', payload: parte }, 'https://site-estranho.com');
  assert.equal(r.status, 403);
  fechar(srv);
});

test('serve a página do Modo Análise sem expor arquivos de fora do mvp/', async () => {
  const { srv, base } = await subir({});
  assert.equal((await fetch(base + '/analise.html')).status, 200);
  assert.equal((await fetch(base + '/../package.json')).status, 404);
  assert.equal((await fetch(base + '/%2e%2e/package.json')).status, 404);
  assert.doesNotMatch(await (await fetch(base + '/config.js')).text(), /apiKey|sk-/);
  fechar(srv);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { criarApp, criarArmazem } from '../servidor.js';

async function subir(t, iniciais = null) {
  const pasta = mkdtempSync(join(tmpdir(), 'lolla-srv-'));
  const mvp = join(pasta, 'mvp');
  mkdirSync(mvp);
  writeFileSync(join(mvp, 'index.html'), '<!doctype html><title>mvp</title>');
  const app = criarApp({ armazem: criarArmazem(join(pasta, 'dados', 'contextos.json'), iniciais), pastaMvp: mvp });
  const srv = createServer(app);
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  t.after(() => srv.close());
  const base = `http://127.0.0.1:${srv.address().port}`;
  const req = async (metodo, caminho, corpo, origem = base) => {
    const r = await fetch(base + caminho, {
      method: metodo,
      headers: { ...(origem ? { Origin: origem } : {}), ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const tipo = r.headers.get('content-type') || '';
    return { status: r.status, corpo: tipo.includes('json') ? await r.json() : await r.text(), headers: r.headers };
  };
  return { base, req };
}

test('serve o MVP e bloqueia caminhos fora da pasta', async (t) => {
  const { req } = await subir(t);
  assert.match((await req('GET', '/')).corpo, /mvp/);
  assert.equal((await req('GET', '/../servidor/servidor.js')).status, 404);
  assert.notEqual((await req('GET', '/%2e%2e/package.json')).status, 200);
});

test('contexto da IA: cadastro, edição, exclusão e validações', async (t) => {
  const { req } = await subir(t);
  assert.equal((await req('POST', '/api/contextos', { titulo: '', texto: 'x' })).status, 422);
  assert.equal((await req('POST', '/api/contextos', { titulo: 'x', texto: '  ' })).status, 422);
  const cpf = await req('POST', '/api/contextos', { titulo: 'Caso', texto: 'Cliente 123.456.789-09 pagou duas vezes' });
  assert.equal(cpf.status, 422);
  assert.match(cpf.corpo.erro, /CPF/, JSON.stringify(cpf));
  assert.equal((await req('POST', '/api/contextos', { titulo: 'Caso', texto: 'contato fulano@empresa.com' })).status, 422);
  assert.equal((await req('POST', '/api/contextos', { titulo: 'Caso', texto: 'x'.repeat(4001) })).status, 422);

  const texto = 'Sicredi: liquidação em lote.\n\nUm crédito por dia = soma das baixas do Gateway.';
  const novo = await req('POST', '/api/contextos', { titulo: 'Sicredi', texto });
  assert.equal(novo.status, 201);
  let lista = await req('GET', '/api/contextos');
  assert.equal(lista.corpo.contextos.length, 1);
  assert.equal(lista.corpo.contextos[0].texto, texto); // quebras de linha preservadas
  assert.equal(lista.corpo.total_caracteres, texto.length);

  assert.equal((await req('PUT', `/api/contextos/${novo.corpo.id}`, { titulo: 'Sicredi lote', texto: 'Novo texto' })).status, 200);
  lista = await req('GET', '/api/contextos');
  assert.equal(lista.corpo.contextos[0].titulo, 'Sicredi lote');
  assert.equal(lista.corpo.contextos[0].texto, 'Novo texto');
  assert.equal((await req('PUT', '/api/contextos/999', { titulo: 'a', texto: 'b' })).status, 404);

  for (let i = 0; i < 4; i++) assert.equal((await req('POST', '/api/contextos', { titulo: `T${i}`, texto: 'a'.repeat(4000) })).status, 201);
  const estoura = await req('POST', '/api/contextos', { titulo: 'T5', texto: 'a'.repeat(4000) });
  assert.equal(estoura.status, 422);
  assert.match(estoura.corpo.erro, /20000/);

  assert.equal((await req('DELETE', `/api/contextos/${novo.corpo.id}`)).status, 200);
  assert.ok(!(await req('GET', '/api/contextos')).corpo.contextos.some((c) => c.id === novo.corpo.id));
  assert.equal((await req('DELETE', `/api/contextos/${novo.corpo.id}`)).status, 404);
});

test('os contextos iniciais do projeto são válidos e entram na primeira vez', async (t) => {
  const arquivo = new URL('../contextos-iniciais.json', import.meta.url);
  const { readFileSync } = await import('node:fs');
  const iniciais = JSON.parse(readFileSync(arquivo, 'utf8'));
  const { LIMITES } = await import('../servidor.js');
  assert.ok(iniciais.length > 0 && iniciais.length <= LIMITES.maxContextos);
  assert.ok(iniciais.reduce((s, c) => s + c.texto.length, 0) <= LIMITES.maxTotal);
  for (const c of iniciais) {
    assert.ok(c.titulo && c.titulo.length <= LIMITES.maxTitulo, c.titulo);
    assert.ok(c.texto && c.texto.length <= LIMITES.maxTexto, c.titulo);
    assert.doesNotMatch(c.texto, /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|@/, c.titulo); // sem CPF nem e-mail
  }
  const { req } = await subir(t, arquivo.pathname);
  const lista = await req('GET', '/api/contextos');
  assert.equal(lista.corpo.contextos.length, iniciais.length);
  // depois de salvar a primeira alteração, a lista passa a ser a do arquivo de dados (apagar não "ressuscita" os iniciais)
  assert.equal((await req('DELETE', '/api/contextos/1')).status, 200);
  assert.equal((await req('GET', '/api/contextos')).corpo.contextos.length, iniciais.length - 1);
});


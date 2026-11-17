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


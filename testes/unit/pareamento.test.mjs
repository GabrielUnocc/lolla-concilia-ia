// O pareamento indexado (mvp/js/domain/pareamento.js) precisa dar exatamente o mesmo resultado da versão original.
import test from 'node:test';
import assert from 'node:assert/strict';
import { carregar } from './_carregar.mjs';

const novo = carregar(['mvp/js/core/base.js', 'mvp/js/domain/pareamento.js']).domain.pareamento;
const original = carregar(['mvp/js/core/base.js', 'testes/referencia/pareamento-original.js']).domain.pareamento;

function aleatorio(semente) {
  let s = semente;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

function cenario(seed, nI, nE) {
  const r = aleatorio(seed);
  const dias = ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];
  const valores = [5990, 7990, 9990, 12000, 15000, 4500, 8000];
  const mov = [], ext = [];
  for (let k = 0; k < nI; k++) {
    mov.push({ id: 'm' + k, conciliado: r() < 0.05, data: dias[Math.floor(r() * 4)], valor: valores[Math.floor(r() * valores.length)],
      documento: r() < 0.5 ? 'D' + Math.floor(r() * 40) : '', tx_id: r() < 0.2 ? 'T' + Math.floor(r() * 30) : '', historico: '' });
  }
  for (let k = 0; k < nE; k++) {
    const lote = r() < 0.15;
    ext.push({ id: 'e' + k, conciliado: r() < 0.05, data: dias[Math.floor(r() * 4)],
      valor: lote ? valores[Math.floor(r() * 7)] + valores[Math.floor(r() * 7)] : (r() < 0.1 ? -500 : valores[Math.floor(r() * valores.length)]),
      documento: r() < 0.3 ? 'D' + Math.floor(r() * 40) : '', tx_id: r() < 0.2 ? 'T' + Math.floor(r() * 30) : '', historico: 'CRED' });
  }
  return [mov, ext];
}

test('pareamento indexado = pareamento original (300 cenários aleatórios)', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const [mov, ext] = cenario(seed, 5 + (seed % 40), 5 + ((seed * 7) % 40));
    assert.deepEqual(JSON.parse(JSON.stringify(novo.parear(mov, ext))), JSON.parse(JSON.stringify(original.parear(mov, ext))), 'seed ' + seed);
  }
});

test('pareamento de 5 mil linhas em menos de 3 s', () => {
  const [mov, ext] = cenario(42, 2500, 2500);
  const t = performance.now();
  const r = novo.parear(mov, ext);
  const ms = performance.now() - t;
  assert.ok(r.pares.length > 0);
  assert.ok(ms < 3000, `levou ${ms.toFixed(0)} ms`);
});

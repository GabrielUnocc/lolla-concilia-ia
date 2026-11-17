// Carrega os scripts clássicos (IIFE no namespace Lolla) num contexto isolado do Node, como o navegador faria.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Ordem de carga do Modo Análise (a mesma do analise.html)
export const DOMINIO_ANALISE = [
  'mvp/js/core/base.js',
  'mvp/js/domain/pareamento.js',
  'mvp/js/domain/mascaramento.js',
  'mvp/js/domain/ofx.js',
  'mvp/js/domain/analise/normalizacao.js',
  'mvp/js/domain/analise/bancos.js',
  'mvp/js/domain/analise/bancos/sicoob.js',
  'mvp/js/domain/analise/bancos/bradesco.js',
  'mvp/js/domain/analise/bancos/bancoDoBrasil.js',
  'mvp/js/domain/analise/bancos/sicredi.js',
  'mvp/js/domain/analise/bancos/itau.js',
  'mvp/js/domain/analise/bancos/santander.js',
  'mvp/js/domain/analise/classificacaoOfx.js',
  'mvp/js/domain/analise/leitorOfx.js',
  'mvp/js/domain/analise/leitorFrancesinha.js',
  'mvp/js/domain/analise/planilha.js',
  'mvp/js/domain/analise/leitorRecebimentos.js',
  'mvp/js/domain/analise/motor.js',
  'mvp/js/domain/analise/resultado.js',
  'mvp/js/domain/analise/privacidadeIa.js'
];

export function carregar(arquivos = DOMINIO_ANALISE) {
  // Roda no mesmo "realm" do teste (assim arrays/objetos comparam com deepStrictEqual),
  // mas com um namespace Lolla novo a cada chamada.
  globalThis.window = globalThis;
  globalThis.self = globalThis;
  delete globalThis.Lolla;
  for (const f of arquivos) vm.runInThisContext(readFileSync(path.join(RAIZ, f), 'utf8'), { filename: f });
  const L = globalThis.Lolla;
  delete globalThis.Lolla;
  return L;
}

export const ler = (rel) => readFileSync(path.join(RAIZ, rel));

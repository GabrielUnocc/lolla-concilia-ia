/*
 * Teste ponta a ponta do Modo Análise no Chromium (Playwright), com as amostras fictícias.
 * Uso: npm run test:e2e   (precisa do pacote "playwright" com o Chromium instalado)
 * - sobe o intermediário local (sem chave real; a "API do Claude" é um servidor de teste local);
 * - envia os 3 arquivos, confere banco, cruzamento, filtros, linhas originais, CSV, texto do chamado;
 * - confere o fluxo da IA: prévia, bloqueio sem consentimento, envio e custo real;
 * - abre também direto do disco (file://) e confere a leitura do PDF sem worker;
 * - tira prints em 360, 768 e 1440 px (pasta testes/e2e/prints, fora do Git).
 */
import http from 'node:http';
import path from 'node:path';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { RAIZ } from '../unit/_carregar.mjs';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { console.error('Instale o Playwright para o teste ponta a ponta: npm i -D playwright && npx playwright install chromium'); process.exit(2); }

const AMOSTRAS = path.join(RAIZ, 'testes/amostras');
const PRINTS = path.join(RAIZ, 'testes/e2e/prints');
mkdirSync(PRINTS, { recursive: true });
const passos = [];
const ok = (t) => { passos.push(t); console.log('  ✓ ' + t); };

// "API do Claude" falsa, local
const falsa = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => {
    const corpo = JSON.parse(b);
    const itens = JSON.parse(corpo.messages[0].content.split('\n').slice(1).join('\n')).itens;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ model: corpo.model, stop_reason: 'end_turn', usage: { input_tokens: 3100, output_tokens: 900 },
      content: [{ type: 'text', text: JSON.stringify({ itens: itens.map((i) => ({ id: i.id, causa_provavel: 'Causa de teste ' + i.id, linhas: [i.linhas[0].ref, 'R:999'], explicacao: 'Explicação de teste.', proximo_passo: 'Passo de teste.', certeza: 'media', pergunta_ao_cliente: '' })), observacoes_gerais: '' }) }] }));
  });
});
await new Promise((r) => falsa.listen(0, '127.0.0.1', r));

process.env.LOLLA_DADOS = mkdtempSync(path.join(os.tmpdir(), 'lolla-e2e-'));
process.env.ANTHROPIC_API_KEY = 'sk-teste-e2e';
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${falsa.address().port}`;
const { criarServidor } = await import('../../intermediario/servidor.mjs');
const srv = criarServidor();
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;

const navegador = await playwright.chromium.launch();
const erros = [];
try {
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => erros.push(e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/config\.js|favicon/.test(m.text())) erros.push(m.text()); });
  await pg.goto(BASE + '/analise.html');
  await pg.waitForSelector('text=Intermediário conectado', { timeout: 10000 });
  ok('página abre e encontra o intermediário');
  await pg.screenshot({ path: path.join(PRINTS, '1440-inicio.png'), fullPage: true });

  assert.ok(await pg.locator('[data-acao=analisar]').isDisabled());
  await pg.setInputFiles('input[data-arquivo=ofx]', path.join(AMOSTRAS, 'sicoob-extrato.ofx'));
  await pg.waitForSelector('[data-drop=ofx] .selo:has-text("Lido")');
  assert.ok(await pg.locator('[data-acao=analisar]').isDisabled());
  ok('sem os três arquivos o cruzamento fica bloqueado');
  await pg.setInputFiles('input[data-arquivo=francesinha]', path.join(AMOSTRAS, 'sicoob-francesinha.pdf'));
  await pg.waitForSelector('[data-drop=francesinha] .estado:has-text("12 título(s)")', { timeout: 15000 });
  ok('francesinha PDF lida no navegador (12 títulos)');
  await pg.setInputFiles('input[data-arquivo=ixc]', path.join(AMOSTRAS, 'ixc-recebimentos.xlsx'));
  await pg.waitForSelector('[data-drop=ixc] .estado:has-text("19 recebimento(s)")');
  ok('relatório IXC XLSX lido (19 recebimentos)');
  assert.match(await pg.textContent('#etapa-banco'), /Sicoob[\s\S]*Confiança alta/);
  ok('banco identificado: Sicoob, confiança alta');
  await pg.click('[data-acao=aba-dados][data-aba=ixc]');
  assert.match(await pg.textContent('#etapa-dados'), /Reconhecidas: Cliente, CPF\/CNPJ/);
  ok('colunas pessoais do IXC reconhecidas e fora do cruzamento');

  await pg.click('[data-acao=analisar]');
  await pg.waitForSelector('#lista-itens .item');
  const res = await pg.textContent('#etapa-resultado');
  assert.match(res, /Todas as 44 linhas lidas foram classificadas/);
  assert.match(res, /Correspondências\s*11/);
  ok('cruzamento: 44 linhas classificadas, 11 correspondências');
  await pg.screenshot({ path: path.join(PRINTS, '1440-resultado.png'), fullPage: true });

  await pg.click('[data-acao=grupo][data-grupo=so_ixc]');
  assert.equal(await pg.locator('#lista-itens details.item').count(), 2);
  await pg.click('[data-acao=grupo][data-grupo=todos]');
  await pg.fill('#busca', '1007-6');
  await pg.waitForTimeout(400);
  assert.ok((await pg.locator('#lista-itens details.item').count()) >= 1);
  await pg.locator('#lista-itens details.item').first().locator('summary').click();
  await pg.waitForSelector('#lista-itens details.item[open] .fontes');
  assert.match(await pg.textContent('#lista-itens details.item[open]'), /CLIENTE FICTICIO SETE/);   // linha original, só local
  ok('filtro por categoria, pesquisa e linha original do item');
  await pg.fill('#busca', '');
  await pg.waitForTimeout(400);

  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('[data-acao=csv]')]);
  const csv = readFileSync(await dl.path(), 'utf8');
  assert.match(dl.suggestedFilename(), /^lolla-analise-sicoob-2026-11-03_2026-11-08\.csv$/);
  assert.match(csv, /^﻿item;grupo;classificacao/);
  ok('CSV exportado (' + csv.trim().split('\n').length + ' linhas)');
  await pg.click('[data-acao=copiar]');
  const txt = await pg.evaluate(() => navigator.clipboard.readText());
  assert.match(txt, /Banco: Sicoob \| Período: 03\/11\/2026 a 08\/11\/2026/);
  ok('texto copiado para o chamado');

  // IA
  await pg.click('[data-acao=ia-preparar]');
  await pg.waitForSelector('text=Conferência de privacidade: nenhum CPF/CNPJ');
  const previa = await pg.textContent('pre.previa');
  assert.doesNotMatch(previa, /FICTICI|\d{3}\.\d{3}\.\d{3}-\d{2}/);
  assert.ok(await pg.locator('[data-acao=ia-enviar]').isDisabled());
  ok('prévia do envio sem dados pessoais; envio bloqueado sem consentimento');
  await pg.check('[data-acao=ia-consentimento]');
  await pg.click('[data-acao=ia-enviar]');
  await pg.waitForSelector('text=Custo real', { timeout: 15000 });
  const ia = await pg.textContent('#etapa-ia');
  assert.match(ia, /R:999/);                              // linha inventada pela "IA" foi descartada e avisada
  assert.match(ia, /item\(ns\) com interpretação/);
  ok('IA: envio com consentimento, resposta validada e custo real mostrado');
  await pg.screenshot({ path: path.join(PRINTS, '1440-ia.png'), fullPage: true });

  for (const w of [360, 768]) {
    await pg.setViewportSize({ width: w, height: 900 });
    await pg.waitForTimeout(200);
    const larg = await pg.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(larg <= w + 1, `rolagem horizontal em ${w}px (${larg})`);
    await pg.screenshot({ path: path.join(PRINTS, `${w}-resultado.png`), fullPage: true });
  }
  ok('sem rolagem horizontal em 360 e 768 px');

  // file:// (abrir com duplo clique): PDF sem worker e IA apontando para o intermediário
  const pf = await ctx.newPage();
  pf.on('pageerror', (e) => erros.push('file:// ' + e.message));
  await pf.goto('file://' + path.join(RAIZ, 'mvp/analise.html'));
  await pf.setInputFiles('input[data-arquivo=francesinha]', path.join(AMOSTRAS, 'francesinha-escaneada.pdf'));
  await pf.waitForSelector('[data-drop=francesinha] .alerta.erro:has-text("OCR")', { timeout: 15000 });
  ok('file://: PDF escaneado recusado com mensagem clara');
  await pf.setInputFiles('input[data-arquivo=francesinha]', path.join(AMOSTRAS, 'sicoob-francesinha.pdf'));
  await pf.waitForSelector('[data-drop=francesinha] .estado:has-text("12 título(s)")', { timeout: 15000 });
  ok('file://: francesinha lida sem worker');

  assert.deepEqual(erros, []);
  ok('nenhum erro de JavaScript no console');
  console.log(`\n${passos.length} verificações ponta a ponta OK`);
} catch (e) {
  console.error('FALHOU:', e.message, erros);
  process.exitCode = 1;
} finally {
  await navegador.close();
  srv.closeAllConnections(); srv.close(); falsa.close();
}

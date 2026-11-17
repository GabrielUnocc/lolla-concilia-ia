import test from 'node:test';
import assert from 'node:assert/strict';
import { carregar } from './_carregar.mjs';

const A = carregar().domain.analise;

test('seis bancos registrados; Sicoob completo e os demais com estrutura pendente', () => {
  const ids = A.bancos.lista().map((b) => b.id).sort();
  assert.deepEqual(ids, ['bb', 'bradesco', 'itau', 'santander', 'sicoob', 'sicredi']);
  assert.equal(A.bancos.obter('sicoob').status, 'completo');
  A.bancos.lista().filter((b) => b.id !== 'sicoob').forEach((b) => { assert.equal(b.status, 'pendente'); assert.equal(b.francesinha, null); assert.ok(b.pendencias.length); });
  assert.equal(A.bancos.porCodigo('0756').id, 'sicoob');
  assert.equal(A.bancos.porCodigo('1').id, 'bb');
  assert.equal(A.bancos.porCodigo('033').id, 'santander');
});

test('detecção pelo OFX e pela francesinha, com conflito apontado', () => {
  const ofxSicoob = { conta: { bancoCodigo: '756' } };
  let d = A.bancos.detectar({ ofx: ofxSicoob, textoFrancesinha: 'SICOOB - Relatório de títulos liquidados' });
  assert.equal(d.id, 'sicoob'); assert.equal(d.confianca, 'alta'); assert.equal(d.conflito, false);
  d = A.bancos.detectar({ ofx: { conta: { bancoCodigo: '237' } }, textoFrancesinha: 'Banco Sicredi - Cobrança' });
  assert.equal(d.conflito, true); assert.equal(d.confianca, 'baixa'); assert.equal(d.id, 'bradesco');
  d = A.bancos.detectar({ ofx: { conta: { bancoCodigo: '341' } } });
  assert.equal(d.id, 'itau'); assert.equal(d.confianca, 'media');
  d = A.bancos.detectar({ ofx: { conta: { bancoCodigo: '999' } } });
  assert.equal(d.id, null);
});

test('classificação das descrições do OFX (issue #7)', () => {
  const sicoob = A.bancos.obter('sicoob');
  const c = (descricao, valor, banco = sicoob) => A.classificacaoOfx.classificar({ descricao, valor }, banco).categoria;
  assert.equal(c('CRÉD.LIQUIDAÇÃO COBRANÇA', 100), 'recebimento');
  assert.equal(c('CRÃD.LIQUIDAÃÃO COBRANÃA', 100), 'recebimento');        // caracteres quebrados
  assert.equal(c('DÉB.TARIFA COBRANÇA', -450), 'tarifa');
  assert.equal(c('ESTORNO TARIFA', 450), 'estorno');
  assert.equal(c('PIX RECEBIDO - FULANO', 100), 'recebimento');
  assert.equal(c('CRED TED - EMPRESA', 100), 'transferencia');
  assert.equal(c('TED ENVIADA', -100), 'saida');
  assert.equal(c('RENDIMENTO APLIC.AUTOMATICA', 12), 'rendimento');
  assert.equal(c('BLOQUEIO JUDICIAL', -100), 'retencao');
  assert.equal(c('PAGTO FORNECEDOR', -100), 'saida');
  assert.equal(c('XPTO 123', 100), 'nao_classificado');
  assert.equal(c('LIQUIDACAO BOLETO SICREDI', 100, A.bancos.obter('sicredi')), 'recebimento');
});

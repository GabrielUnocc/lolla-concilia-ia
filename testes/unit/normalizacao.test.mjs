import test from 'node:test';
import assert from 'node:assert/strict';
import { carregar } from './_carregar.mjs';

const N = carregar().domain.analise.norm;

test('valores viram centavos inteiros', () => {
  const casos = [['1.234,56', 123456], ['R$ 1.234,56', 123456], ['1234,5', 123450], ['1,234.56', 123456], ['1234.56', 123456], ['1.234', 123400],
    ['(12,00)', -1200], ['-12,00', -1200], ['12,00 D', -1200], ['12,00C', 1200], [99.9, 9990], [0.1 + 0.2, 30], [1e-9, 0], ['0,01', 1], ['  60,00 ', 6000]];
  casos.forEach(([v, c]) => assert.equal(N.centavos(v), c, String(v)));
  ['', 'abc', '1,2,3', null, '12a'].forEach((v) => assert.ok(Number.isNaN(N.centavos(v)), String(v)));
});

test('datas viram AAAA-MM-DD e datas impossíveis são recusadas', () => {
  const casos = [['02/11/2026', '2026-11-02'], ['2/11/26', '2026-11-02'], ['02-11-2026', '2026-11-02'], ['2026-11-02', '2026-11-02'],
    ['20261102120000[-3:BRT]', '2026-11-02'], ['02/11/2026 14:33:10', '2026-11-02'], [46328, '2026-11-02'], ['31/02/2026', ''], ['', ''], ['abc', '']];
  casos.forEach(([v, d]) => assert.equal(N.data(v), d, String(v)));
  assert.equal(N.difDias('2026-11-02', '2026-11-03'), 1);
  assert.equal(N.somarDias('2026-11-30', 1), '2026-12-01');
});

test('nosso número sem zeros à esquerda e sem DV após o hífen', () => {
  assert.deepEqual(N.nossoNumero('0001234-5'), { chave: '1234', bruto: '0001234-5', semUltimo: '', temDv: true });
  assert.equal(N.nossoNumero('00012345').chave, '12345');
  assert.equal(N.nossoNumero('00012345').semUltimo, '1234');
  assert.equal(N.nossoNumero(12345).chave, '12345');
  assert.equal(N.nossoNumero('').chave, '');
});

test('identificadores ficam como texto e recusam notação científica', () => {
  assert.equal(N.id(123), '123');
  assert.equal(N.id('123.0'), '123');
  assert.equal(N.id('1.23E+15'), '');
  assert.equal(N.id(' A-1 '), 'A-1');
});

test('corrige texto UTF-8 lido como Windows-1252 e compara sem acento', () => {
  const quebrado = Buffer.from('CRÉD.LIQUIDAÇÃO COBRANÇA', 'utf8').toString('latin1').replace('\u0083', 'ƒ');
  assert.equal(N.texto(quebrado), 'CRÉD.LIQUIDAÇÃO COBRANÇA');
  assert.equal(N.chaveTexto('CRÉD.LIQUIDAÇÃO  COBRANÇA'), 'CRED LIQUIDACAO COBRANCA');
  assert.equal(N.texto('ok\u0000 texto'), 'ok texto');
  assert.equal(N.texto('JOSÉ'), 'JOSÉ');            // texto certo não é alterado
});

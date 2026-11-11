// Testa o extrator e o pareamento num Chromium headless.
// Uso: npm i playwright && npx playwright install chromium && node testes/rodar_testes.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const raiz = path.join(__dirname, '..');

let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  OK   ' : '  FALHA ') + msg); if (!cond) falhas++; };
const ids = arr => arr.map(x => x.id).join(',');

(async () => {
  const browser = await chromium.launch();
  const abrir = async html => {
    const p = await browser.newPage();
    await p.setContent(html);
    await p.addScriptTag({ path: path.join(raiz, 'extensao/extrator.js') });
    return p.evaluate(() => { const t = ConciliaIA.extrairTela(); return { ...t, res: ConciliaIA.parear(t.ixc, t.extrato) }; });
  };

  console.log('Amostra real mascarada (docs/amostras-ixc)');
  const amostras = ['esquerdo', 'direito'].map(n => fs.readFileSync(path.join(raiz, `docs/amostras-ixc/${n}.html`), 'utf8')).join('');
  const a = await abrir(amostras);
  ok(a.ixc.length === 1 && a.extrato.length === 0, 'lê 1 linha no IXC e 0 no extrato');
  ok(a.ixc[0].id === '131377' && a.ixc[0].valor === 6000 && a.ixc[0].conciliado === false, 'campos da linha (id, valor, conciliado)');

  console.log('Cenário fictício (testes/cenario_ficticio.html)');
  const c = await abrir(fs.readFileSync(path.join(__dirname, 'cenario_ficticio.html'), 'utf8'));
  const par = t => c.res.pares.filter(p => p.tipo === t).map(p => p.ixc.join('+') + '=' + p.extrato[0]).sort().join(' ');
  ok(c.ixc.length === 7 && c.extrato.length === 6, 'lê 7 linhas no IXC e 6 no extrato');
  ok(c.ixc[1].valor === 125050, 'converte 1.250,50');
  ok(par('id') === '1=a 5=d', 'pareia por documento');
  ok(par('valor+data') === '2=b', 'pareia por valor + D+1');
  ok(par('lote') === '3+4=c', 'identifica lote (100 + 80 = 180)');
  ok(JSON.stringify(c.res.possiveis_duplicados) === JSON.stringify([{ documento: '7178370', ids: ['5', '6'] }]), 'aponta duplicado');
  ok(ids(c.res.so_no_ixc) === '6,7', 'sobras só no IXC: 6, 7');
  ok(ids(c.res.so_no_banco) === 'e,f', 'sobras só no banco: tarifa e PIX sem baixa');

  await browser.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\nTodos os testes passaram');
  process.exit(falhas ? 1 : 0);
})();

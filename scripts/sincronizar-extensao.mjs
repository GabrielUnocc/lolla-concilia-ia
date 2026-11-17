#!/usr/bin/env node
/*
 * Copia a lógica e a tela do Modo Análise do MVP (mvp/) para a extensão (extensao/lolla/),
 * para que as duas usem exatamente o mesmo código (regra do projeto: alterou um, copia para o outro).
 *   node scripts/sincronizar-extensao.mjs            copia
 *   node scripts/sincronizar-extensao.mjs --conferir só confere (usado no npm test); sai com erro se houver diferença
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MVP = path.join(RAIZ, 'mvp'), EXT = path.join(RAIZ, 'extensao/lolla');
const conferir = process.argv.includes('--conferir');

const pares = [];
const par = (de, para) => pares.push([path.join(MVP, de), path.join(EXT, para)]);
const pasta = (de, para, filtro = () => true) => readdirSync(path.join(MVP, de), { withFileTypes: true }).forEach((d) => {
  if (d.isDirectory()) pasta(path.join(de, d.name), path.join(para, d.name), filtro);
  else if (filtro(d.name)) par(path.join(de, d.name), path.join(para, d.name));
});

par('js/domain/pareamento.js', 'lib/pareamento.js');
par('js/domain/mascaramento.js', 'lib/mascaramento.js');
par('js/domain/ofx.js', 'lib/ofx.js');
pasta('js/domain/analise', 'lib/analise');
par('js/services/pdfTexto.js', 'lib/servicos/pdfTexto.js');
par('js/services/iaIntermediario.js', 'lib/servicos/iaIntermediario.js');
pasta('js/ui/analise', 'analise');
par('css/analise.css', 'analise/analise.css');
pasta('vendor/pdfjs', 'vendor/pdfjs');

// Página da extensão: mesma página do MVP com os caminhos da extensão (e sem config.js: a CSP do Chrome não aceita handler inline)
function paginaExtensao() {
  return readFileSync(path.join(MVP, 'analise.html'), 'utf8')
    .replace(/\s*<!-- Configuração local opcional[^\n]*\n\s*<script src="config\.js"[^\n]*\n/, '\n')
    .replace('href="css/analise.css"', 'href="analise/analise.css"')
    .replace('src="js/core/base.js"', 'src="lib/base.js"')
    .replace(/src="js\/domain\/analise\//g, 'src="lib/analise/')
    .replace(/src="js\/domain\//g, 'src="lib/')
    .replace(/src="js\/services\//g, 'src="lib/servicos/')
    .replace(/src="js\/ui\/analise\//g, 'src="analise/')
    .replace('<!-- Núcleo e domínio (mesmos arquivos copiados para extensao/lolla/lib/) -->', '<!-- GERADO por scripts/sincronizar-extensao.mjs a partir de mvp/analise.html: não edite aqui -->');
}

const diferentes = [];
for (const [de, para] of pares) {
  const novo = readFileSync(de);
  const atual = existsSync(para) ? readFileSync(para) : null;
  if (atual && Buffer.compare(novo, atual) === 0) continue;
  diferentes.push(path.relative(RAIZ, para));
  if (!conferir) { mkdirSync(path.dirname(para), { recursive: true }); writeFileSync(para, novo); }
}
const destinoPagina = path.join(EXT, 'analise.html');
const pagina = paginaExtensao();
if (!existsSync(destinoPagina) || readFileSync(destinoPagina, 'utf8') !== pagina) {
  diferentes.push(path.relative(RAIZ, destinoPagina));
  if (!conferir) writeFileSync(destinoPagina, pagina);
}

if (conferir) {
  if (diferentes.length) { console.error('Extensão desatualizada em relação ao mvp/. Rode: npm run sincronizar\n  ' + diferentes.join('\n  ')); process.exit(1); }
  console.log(`Extensão sincronizada (${pares.length + 1} arquivos conferidos).`);
} else {
  console.log(diferentes.length ? 'Atualizados:\n  ' + diferentes.join('\n  ') : 'Nada a atualizar.');
}

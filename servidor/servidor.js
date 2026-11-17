/*
 * Servidor local da AR Lolla.
 * - Serve o MVP (pasta mvp/) em http://127.0.0.1:3100 (npm run contexto; a 3000 é do app/)
 * - Guarda o Contexto da IA num arquivo local e atende o MVP e a extensão,
 *   para os dois usarem a MESMA lista de contextos.
 * Sem dependências: só Node 22+.
 */
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises';
import { resolve, join, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const PASTA_MVP = join(RAIZ, 'mvp');
const PORTA = Number(process.env.CONTEXTO_PORTA || 3100);
const HOST = process.env.CONTEXTO_HOST || '127.0.0.1';
const ARQUIVO = resolve(process.env.ARQUIVO_CONTEXTOS || join(RAIZ, 'servidor', 'dados', 'contextos.json'));
// Contextos que já vêm com o projeto: usados só na primeira vez, quando ainda não há lista salva
const INICIAIS = join(RAIZ, 'servidor', 'contextos-iniciais.json');

// Limites para não estourar o consumo de tokens (1 token ≈ 4 caracteres em português)
export const LIMITES = { maxContextos: 20, maxTitulo: 120, maxTexto: 4000, maxTotal: 20000 };
// O contexto vai para a IA: recusa o que parece dado pessoal de cliente
const DADO_PESSOAL = [
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/, 'um CPF'],
  [/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/, 'um CNPJ'],
  [/[\w.+-]+@[\w-]+\.[\w.]+/, 'um e-mail'],
];

class ErroValidacao extends Error {}

/* ---------- armazenamento: um arquivo JSON, gravado de forma atômica ---------- */
export function criarArmazem(arquivo = ARQUIVO, iniciais = INICIAIS) {
  let fila = Promise.resolve();
  const lerIniciais = async () => {
    if (!iniciais) return [];
    try { return JSON.parse(await readFile(iniciais, 'utf8')); } catch { return []; }
  };
  const ler = async () => {
    try { return JSON.parse(await readFile(arquivo, 'utf8')); }
    catch (e) {
      if (e.code !== 'ENOENT') throw e;
      const agora = new Date().toISOString();
      const contextos = (await lerIniciais()).map((c, k) => ({ id: k + 1, titulo: c.titulo, texto: c.texto, criado_em: agora, atualizado_em: agora }));
      return { proximoId: contextos.length + 1, contextos };
    }
  };
  const gravar = async (dados) => {
    await mkdir(dirname(arquivo), { recursive: true });
    const tmp = arquivo + '.tmp';
    await writeFile(tmp, JSON.stringify(dados, null, 1), { mode: 0o600 });
    await rename(tmp, arquivo);
  };
  // Alterações em fila: duas gravações ao mesmo tempo não se atropelam
  // (um erro de validação devolve o erro só para quem pediu e não trava a fila)
  const alterar = (fn) => {
    const p = fila.then(async () => { const d = await ler(); const r = fn(d); await gravar(d); return r; });
    fila = p.catch(() => {});
    return p;
  };
  return { ler, alterar };
}

function validar(corpo, dados, id = null) {
  const titulo = String(corpo?.titulo ?? '').trim();
  const texto = String(corpo?.texto ?? '').replace(/\r\n/g, '\n').trim();
  if (!titulo) throw new ErroValidacao('Informe o título');
  if (!texto) throw new ErroValidacao('Escreva o texto do contexto');
  if (titulo.length > LIMITES.maxTitulo) throw new ErroValidacao(`Título: no máximo ${LIMITES.maxTitulo} caracteres`);
  if (texto.length > LIMITES.maxTexto) throw new ErroValidacao(`Texto: no máximo ${LIMITES.maxTexto} caracteres`);
  for (const [re, nome] of DADO_PESSOAL) {
    if (re.test(titulo) || re.test(texto)) throw new ErroValidacao(`O texto parece ter ${nome}. Não coloque dados de clientes: este contexto vai para a IA.`);
  }
  const outros = dados.contextos.filter((c) => c.id !== id);
  if (id === null && outros.length >= LIMITES.maxContextos) throw new ErroValidacao(`Limite de ${LIMITES.maxContextos} contextos. Apague um para criar outro.`);
  const total = outros.reduce((s, c) => s + c.texto.length, 0) + texto.length;
  if (total > LIMITES.maxTotal) throw new ErroValidacao(`Os contextos somados passariam de ${LIMITES.maxTotal} caracteres (ficariam com ${total}). Encurte este ou apague outro.`);
  return { titulo, texto };
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ofx': 'application/x-ofx', '.ico': 'image/x-icon' };

export function criarApp({ armazem = criarArmazem(), pastaMvp = PASTA_MVP } = {}) {
  const json = (res, status, corpo, extra = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
    res.end(JSON.stringify(corpo));
  };

  // Quem pode usar a API: o próprio MVP (mesma origem) e extensões do Chrome.
  // Bloqueia outros sites abertos no navegador de lerem ou alterarem os contextos.
  const origemOk = (req) => {
    const o = req.headers.origin;
    if (!o) return req.method === 'GET'; // curl/testes só leem; escrita exige Origin
    if (o.startsWith('chrome-extension://')) return true;
    try { return new URL(o).host === req.headers.host; } catch { return false; }
  };
  const cors = (req) => (req.headers.origin || '').startsWith('chrome-extension://')
    ? { 'Access-Control-Allow-Origin': req.headers.origin, 'Vary': 'Origin' } : {};

  const lerCorpo = (req) => new Promise((ok, falha) => {
    if (!(req.headers['content-type'] || '').startsWith('application/json')) return falha(new ErroValidacao('Envie JSON'));
    let tam = 0; const partes = [];
    req.on('data', (c) => { tam += c.length; if (tam > 64 * 1024) { falha(new ErroValidacao('Conteúdo grande demais')); req.destroy(); } else partes.push(c); });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(partes).toString('utf8') || '{}')); } catch { falha(new ErroValidacao('JSON inválido')); } });
    req.on('error', falha);
  });

  async function api(req, res, caminho) {
    if (req.method === 'OPTIONS') {
      if (!origemOk({ ...req, method: 'POST', headers: req.headers })) return json(res, 403, { erro: 'Origem não permitida' });
      res.writeHead(204, { ...cors(req), 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' });
      return res.end();
    }
    if (!origemOk(req)) return json(res, 403, { erro: 'Origem não permitida' });
    const h = cors(req);
    const m = caminho.match(/^\/api\/contextos(?:\/(\d+))?$/);
    if (!m) return json(res, 404, { erro: 'Rota não encontrada' }, h);
    const id = m[1] ? Number(m[1]) : null;

    if (req.method === 'GET' && id === null) {
      const d = await armazem.ler();
      const contextos = [...d.contextos].sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em) || a.id - b.id);
      return json(res, 200, { contextos, limites: LIMITES, total_caracteres: contextos.reduce((s, c) => s + c.texto.length, 0) }, h);
    }
    if (req.method === 'POST' && id === null) {
      const corpo = await lerCorpo(req);
      const novo = await armazem.alterar((d) => {
        const v = validar(corpo, d);
        const agora = new Date().toISOString();
        const c = { id: d.proximoId++, ...v, criado_em: agora, atualizado_em: agora };
        d.contextos.push(c);
        return c;
      });
      return json(res, 201, novo, h);
    }
    if (req.method === 'PUT' && id !== null) {
      const corpo = await lerCorpo(req);
      const c = await armazem.alterar((d) => {
        const atual = d.contextos.find((x) => x.id === id);
        if (!atual) return null;
        Object.assign(atual, validar(corpo, d, id), { atualizado_em: new Date().toISOString() });
        return atual;
      });
      return c ? json(res, 200, c, h) : json(res, 404, { erro: 'Contexto não encontrado' }, h);
    }
    if (req.method === 'DELETE' && id !== null) {
      const ok = await armazem.alterar((d) => {
        const antes = d.contextos.length;
        d.contextos = d.contextos.filter((x) => x.id !== id);
        return d.contextos.length < antes;
      });
      return ok ? json(res, 200, { ok: true }, h) : json(res, 404, { erro: 'Contexto não encontrado' }, h);
    }
    return json(res, 405, { erro: 'Método não permitido' }, h);
  }

  async function estatico(req, res, caminho) {
    if (caminho === '/') caminho = '/index.html';
    const alvo = resolve(pastaMvp, '.' + caminho);
    if (!alvo.startsWith(pastaMvp + sep)) return json(res, 403, { erro: 'Proibido' });
    try {
      if (!(await stat(alvo)).isFile()) throw new Error();
      res.writeHead(200, { 'Content-Type': MIME[extname(alvo)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(await readFile(alvo));
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Não encontrado');
    }
  }

  return async function app(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    const caminho = decodeURIComponent(new URL(req.url, 'http://local').pathname);
    try {
      if (caminho.startsWith('/api/')) return await api(req, res, caminho);
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { erro: 'Método não permitido' });
      return await estatico(req, res, caminho);
    } catch (e) {
      if (e instanceof ErroValidacao) return json(res, 422, { erro: e.message }, cors(req));
      console.error(e);
      json(res, 500, { erro: 'Erro interno' });
    }
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createServer(criarApp()).listen(PORTA, HOST, () => {
    console.log(`AR Lolla em http://${HOST}:${PORTA}  (MVP + Contexto da IA)`);
    console.log(`Contextos salvos em ${ARQUIVO}`);
  });
}

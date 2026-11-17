#!/usr/bin/env node
/*
 * Intermediário local da Lolla (Modo Análise).
 * - Guarda a chave da API do Claude (só aqui; nunca vai para o navegador).
 * - Aceita só o pedido "interpretar divergências", com dados já mascarados, e confere de novo se não há CPF/CNPJ/e-mail.
 * - Controla custo: estimativa antes, limite por análise e por dia, custo real depois (registro sem conteúdo).
 * - Serve a página do Modo Análise (pasta mvp/) em http://127.0.0.1:8787/analise.html.
 * Sem dependências (Node 22+). Para trocar por uma solução da TI, basta manter o mesmo contrato HTTP (veja README).
 */
import http from 'node:http';
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SISTEMA, mensagemUsuario } from './prompt.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ_MVP = path.resolve(AQUI, '..', 'mvp');

// .env local opcional (fora do Git)
const arqEnv = path.join(AQUI, '.env');
if (existsSync(arqEnv)) {
  readFileSync(arqEnv, 'utf8').split(/\r?\n/).forEach((l) => {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
}

const env = process.env;
const num = (v, p) => (v != null && v !== '' && isFinite(Number(v)) ? Number(v) : p);
export const CONFIG = {
  porta: num(env.LOLLA_PORTA, 8787),
  host: env.LOLLA_HOST || '127.0.0.1',
  chave: env.ANTHROPIC_API_KEY || '',
  baseUrl: (env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, ''),
  dolar: num(env.LOLLA_DOLAR, 5.5),
  limiteAnalise: num(env.LOLLA_LIMITE_ANALISE_REAIS, 1),
  limiteDia: num(env.LOLLA_LIMITE_DIA_REAIS, 10),
  maxTokensSaida: num(env.LOLLA_MAX_TOKENS_SAIDA, 4000),
  dados: env.LOLLA_DADOS || path.join(AQUI, 'dados'),
  // Preços em US$ por milhão de tokens (entrada/saída) — mesmos de docs/requisitos/07-custo-da-ia.md. Conferir na tabela da Anthropic.
  modelos: env.LOLLA_MODELOS ? JSON.parse(env.LOLLA_MODELOS) : [
    { id: 'claude-haiku-5-5', nome: 'Claude Haiku', entrada: 0.10, saida: 0.50, padrao: true, habilitado: true },
    { id: 'claude-sonnet-5-5', nome: 'Claude Sonnet', entrada: 2, saida: 10, habilitado: true },
    { id: 'claude-opus-5-5', nome: 'Claude Opus', entrada: 4, saida: 20, habilitado: env.LOLLA_OPUS === '1', observacao: 'Não necessário no MVP' }
  ],
  origens: (env.LOLLA_ORIGENS || 'null,http://127.0.0.1:*,http://localhost:*,chrome-extension://*').split(',').map((s) => s.trim()).filter(Boolean)
};

const CARACTERES_POR_TOKEN = 3.2;   // estimativa conservadora para JSON em português
const estimarTokens = (texto) => Math.ceil(String(texto).length / CARACTERES_POR_TOKEN);
const custoReais = (m, tin, tout) => ((tin * m.entrada + tout * m.saida) / 1e6) * CONFIG.dolar;
const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

/* ---------- Registro de uso (sem conteúdo: só data, modelo, tokens e custo) ---------- */
const arqUso = () => path.join(CONFIG.dados, 'uso.json');
async function lerUso() {
  try { return JSON.parse(await readFile(arqUso(), 'utf8')); } catch { return { dias: {}, analises: {} }; }
}
async function registrarUso(reg) {
  const uso = await lerUso();
  const d = (uso.dias[hoje()] = uso.dias[hoje()] || { gasto: 0, consultas: 0 });
  d.gasto += reg.custo; d.consultas += 1;
  uso.analises[reg.analiseId] = (uso.analises[reg.analiseId] || 0) + reg.custo;
  await mkdir(CONFIG.dados, { recursive: true });
  await writeFile(arqUso(), JSON.stringify(uso, null, 1));
  await appendFile(path.join(CONFIG.dados, 'uso.log'), JSON.stringify(Object.assign({ em: new Date().toISOString() }, reg)) + '\n');
  return uso;
}

/* ---------- Conferência do que chega do navegador ---------- */
const RE_PESSOAL = [
  [/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/, 'CPF'], [/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/, 'CNPJ'],
  [/[^\s"@]+@[^\s"@]+\.[a-z]{2,}/i, 'e-mail'], [/\(\d{2}\)\s?9?\d{4}-?\d{4}/, 'telefone']
];
const CHAVES_PROIBIDAS = ['bruto', 'pessoais', 'nome', 'cliente', 'cpf', 'cnpj', 'sacado', 'pagador', 'email', 'conta', 'arquivo'];
export function validarPayload(p) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.itens) || !p.contexto) return 'Formato inválido: esperado { contexto, itens: [] }.';
  if (!p.itens.length) return 'Nenhum item para interpretar.';
  if (p.itens.length > 80) return 'Itens demais numa parte (máximo 80). Divida a análise.';
  if (p.itens.some((i) => !i || typeof i.id !== 'string' || !Array.isArray(i.linhas))) return 'Item sem id ou sem linhas.';
  const json = JSON.stringify(p);
  for (const [re, nome] of RE_PESSOAL) if (re.test(json)) return `Bloqueado: o conteúdo tem algo com formato de ${nome}.`;
  const chaves = (json.match(/"([a-z_]+)":/g) || []).map((c) => c.slice(1, -2));
  const proibida = chaves.find((c) => CHAVES_PROIBIDAS.includes(c));
  if (proibida) return `Bloqueado: campo "${proibida}" não pode ser enviado.`;
  return null;
}

function extrairJson(texto) {
  const limpo = String(texto).replace(/```(?:json)?/g, '').trim();
  const ini = limpo.indexOf('{'), fim = limpo.lastIndexOf('}');
  if (ini < 0 || fim < ini) return null;
  try { return JSON.parse(limpo.slice(ini, fim + 1)); } catch { return null; }
}

/* ---------- HTTP ---------- */
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ofx': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

function origemPermitida(origem) {
  if (!origem) return null;
  return CONFIG.origens.some((o) => (o.endsWith('*') ? origem.startsWith(o.slice(0, -1)) : o === origem)) ? origem : null;
}

function responder(res, status, corpo, origem) {
  const h = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
  if (origem) Object.assign(h, { 'access-control-allow-origin': origem, vary: 'Origin' });
  res.writeHead(status, h);
  res.end(JSON.stringify(corpo));
}

async function lerCorpo(req, limite = 400 * 1024) {
  const partes = []; let tam = 0;
  for await (const p of req) { tam += p.length; if (tam > limite) throw Object.assign(new Error('Pedido grande demais.'), { status: 413 }); partes.push(p); }
  return JSON.parse(Buffer.concat(partes).toString('utf8') || '{}');
}

async function status() {
  const uso = await lerUso();
  const gasto = (uso.dias[hoje()] || {}).gasto || 0;
  return {
    servico: 'lolla-intermediario', versao: 1,
    disponivel: !!CONFIG.chave,
    motivo: CONFIG.chave ? '' : 'Chave da API não configurada no intermediário (ANTHROPIC_API_KEY).',
    modelos: CONFIG.modelos.map((m) => ({ id: m.id, nome: m.nome, entradaUsdMtok: m.entrada, saidaUsdMtok: m.saida, padrao: !!m.padrao, habilitado: m.habilitado !== false, observacao: m.observacao || '' })),
    dolar: CONFIG.dolar,
    limites: { porAnalise: CONFIG.limiteAnalise, porDia: CONFIG.limiteDia, gastoHoje: Number(gasto.toFixed(4)), saldoHoje: Number(Math.max(0, CONFIG.limiteDia - gasto).toFixed(4)) },
    tokensPrompt: estimarTokens(SISTEMA) + 40,
    caracteresPorToken: CARACTERES_POR_TOKEN,
    maxTokensSaida: CONFIG.maxTokensSaida
  };
}

async function interpretar(corpo) {
  const { modelo: idModelo, payload, analiseId } = corpo || {};
  const modelo = CONFIG.modelos.find((m) => m.id === idModelo && m.habilitado !== false);
  if (!modelo) return [400, { erro: 'modelo', motivo: `Modelo não permitido: ${idModelo}` }];
  if (!analiseId || !/^[\w-]{6,64}$/.test(analiseId)) return [400, { erro: 'analise', motivo: 'Identificador da análise ausente ou inválido.' }];
  const invalido = validarPayload(payload);
  if (invalido) return [422, { erro: 'payload', motivo: invalido }];
  if (!CONFIG.chave) return [503, { erro: 'indisponivel', motivo: 'Chave da API não configurada no intermediário.' }];

  const conteudo = mensagemUsuario(payload);
  const tin = estimarTokens(SISTEMA) + estimarTokens(conteudo) + 40;
  const maximo = custoReais(modelo, tin, CONFIG.maxTokensSaida);
  const uso = await lerUso();
  const gastoDia = (uso.dias[hoje()] || {}).gasto || 0, gastoAnalise = uso.analises[analiseId] || 0;
  if (gastoAnalise + maximo > CONFIG.limiteAnalise) {
    return [402, { erro: 'limite_analise', motivo: `Limite por análise: já gasto R$ ${gastoAnalise.toFixed(4)} + até R$ ${maximo.toFixed(4)} nesta consulta passaria de R$ ${CONFIG.limiteAnalise.toFixed(2)}. Use um modelo mais barato ou envie menos itens.` }];
  }
  if (gastoDia + maximo > CONFIG.limiteDia) {
    return [402, { erro: 'limite_dia', motivo: `Limite diário: gasto hoje R$ ${gastoDia.toFixed(4)} + até R$ ${maximo.toFixed(4)} passaria de R$ ${CONFIG.limiteDia.toFixed(2)}.` }];
  }

  let resp, corpoApi;
  try {
    resp = await fetch(CONFIG.baseUrl + '/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': CONFIG.chave, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: modelo.id, max_tokens: CONFIG.maxTokensSaida, system: SISTEMA, messages: [{ role: 'user', content: conteudo }] }),
      signal: AbortSignal.timeout(120000)
    });
    corpoApi = await resp.json().catch(() => ({}));
  } catch (e) {
    return [502, { erro: 'conexao', motivo: 'Sem conexão com a API do Claude: ' + e.message }];
  }
  if (!resp.ok) {
    const msg = (corpoApi.error && corpoApi.error.message) || resp.statusText;
    return [502, { erro: 'api', status: resp.status, motivo: `API do Claude respondeu ${resp.status}: ${msg}` }];
  }
  const u = corpoApi.usage || {};
  const tokensEntrada = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  const tokensSaida = u.output_tokens || 0;
  const custo = custoReais(modelo, tokensEntrada, tokensSaida);
  const depois = await registrarUso({ analiseId, modelo: modelo.id, tokensEntrada, tokensSaida, custo, itens: payload.itens.length });
  const gastoHoje = depois.dias[hoje()].gasto;
  const texto = (corpoApi.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const resultado = extrairJson(texto);
  const base = { modelo: corpoApi.model || modelo.id, usage: { tokensEntrada, tokensSaida }, custoReais: Number(custo.toFixed(6)),
    estimativaReais: Number(maximo.toFixed(6)), gastoHoje: Number(gastoHoje.toFixed(4)), saldoHoje: Number(Math.max(0, CONFIG.limiteDia - gastoHoje).toFixed(4)),
    gastoAnalise: Number((depois.analises[analiseId] || 0).toFixed(4)), truncado: corpoApi.stop_reason === 'max_tokens' };
  if (!resultado) return [502, Object.assign(base, { erro: 'formato', motivo: 'A IA não devolveu um JSON válido (consulta cobrada).' })];
  return [200, Object.assign(base, { resultado })];
}

async function servirArquivo(req, res) {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel === '/' || rel === '') return res.writeHead(302, { location: '/analise.html' }).end();
  const alvo = path.resolve(RAIZ_MVP, '.' + rel);
  // config.js do MVP antigo pode ter a chave da API: nunca é servido (a página funciona sem ele)
  if (alvo === path.join(RAIZ_MVP, 'config.js')) return res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }).end('/* config.js não é servido pelo intermediário */');
  if (!alvo.startsWith(RAIZ_MVP + path.sep) || path.basename(alvo).startsWith('.')) return res.writeHead(404).end();
  try {
    const dados = await readFile(alvo);
    res.writeHead(200, { 'content-type': TIPOS[path.extname(alvo).toLowerCase()] || 'application/octet-stream', 'x-content-type-options': 'nosniff', 'cache-control': 'no-cache' });
    res.end(dados);
  } catch { res.writeHead(404).end(); }
}

export function criarServidor() {
  return http.createServer(async (req, res) => {
    const origem = origemPermitida(req.headers.origin);
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname.startsWith('/v1/')) {
        if (req.headers.origin && !origem) return responder(res, 403, { erro: 'origem', motivo: 'Origem não permitida: ' + req.headers.origin });
        if (req.method === 'OPTIONS') {
          res.writeHead(204, { 'access-control-allow-origin': origem || '*', 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '600' });
          return res.end();
        }
        if (req.method === 'GET' && url.pathname === '/v1/status') return responder(res, 200, await status(), origem);
        if (req.method === 'POST' && url.pathname === '/v1/interpretar') {
          if (!/application\/json/.test(req.headers['content-type'] || '')) return responder(res, 415, { erro: 'tipo', motivo: 'Use application/json.' }, origem);
          const [st, corpo] = await interpretar(await lerCorpo(req));
          return responder(res, st, corpo, origem);
        }
        return responder(res, 404, { erro: 'rota' }, origem);
      }
      if (req.method === 'GET') return servirArquivo(req, res);
      res.writeHead(405).end();
    } catch (e) {
      responder(res, e.status || 500, { erro: 'interno', motivo: e.message }, origem);
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  criarServidor().listen(CONFIG.porta, CONFIG.host, () => {
    console.log(`Lolla — intermediário local em http://${CONFIG.host}:${CONFIG.porta}`);
    console.log(`Modo Análise: http://${CONFIG.host}:${CONFIG.porta}/analise.html`);
    console.log(CONFIG.chave ? 'IA: disponível (chave carregada do ambiente).' : 'IA: INDISPONÍVEL — defina ANTHROPIC_API_KEY (ou intermediario/.env) para habilitar.');
    console.log(`Limites: R$ ${CONFIG.limiteAnalise.toFixed(2)} por análise, R$ ${CONFIG.limiteDia.toFixed(2)} por dia.`);
  });
}

/*
 * Service worker da AR Lolla.
 * - Registra o script da Lolla SÓ nos endereços do IXC cadastrados (nenhum outro site).
 * - Guarda a configuração e faz as chamadas à API do Claude (a chave nunca vai para a página do IXC).
 */
importScripts('lib/base.js', 'lib/prompts.js');

const PADRAO = { ativo: true, visualModerno: true, enderecos: [], apiKey: '', workspaceId: '', modelo: 'claude-sonnet-5-5', iaSimulada: false, servidorLolla: '' };
const ID_SCRIPT = 'lolla-ixc';
const ARQUIVOS_CONTEUDO = [
  'lib/base.js', 'lib/pareamento.js', 'lib/mascaramento.js', 'lib/indicadores.js', 'lib/simulador.js',
  'conteudo/leitor.js', 'conteudo/visual.js', 'conteudo/painel.js', 'conteudo/conteudo.js'
];

const cfg = () => chrome.storage.local.get(PADRAO);
const padroes = (enderecos) => enderecos.map((o) => o.replace(/\/+$/, '') + '/*');

async function sincronizarScripts() {
  const { enderecos } = await cfg();
  try { await chrome.scripting.unregisterContentScripts({ ids: [ID_SCRIPT] }); } catch (e) { /* não existia */ }
  if (!enderecos.length) return;
  const permitidos = [];
  for (const p of padroes(enderecos)) {
    if (await chrome.permissions.contains({ origins: [p] })) permitidos.push(p);
  }
  if (!permitidos.length) return;
  await chrome.scripting.registerContentScripts([{
    id: ID_SCRIPT, matches: permitidos, js: ARQUIVOS_CONTEUDO, allFrames: true, runAt: 'document_idle', persistAcrossSessions: true
  }]);
}

// Injeta nas abas do IXC que já estavam abertas (sem precisar recarregar)
async function injetarNasAbasAbertas() {
  const { enderecos, ativo } = await cfg();
  if (!ativo || !enderecos.length) return;
  const abas = await chrome.tabs.query({ url: padroes(enderecos) });
  for (const aba of abas) {
    try { await chrome.scripting.executeScript({ target: { tabId: aba.id, allFrames: true }, files: ARQUIVOS_CONTEUDO }); } catch (e) { /* aba sem permissão */ }
  }
}

async function atualizarSelo() {
  const { ativo } = await cfg();
  await chrome.action.setBadgeText({ text: ativo ? '' : 'OFF' });
  await chrome.action.setBadgeBackgroundColor({ color: '#8a96a5' });
}

chrome.runtime.onInstalled.addListener(async (d) => {
  await sincronizarScripts(); await atualizarSelo();
  if (d.reason === 'install') chrome.runtime.openOptionsPage();
});
chrome.runtime.onStartup.addListener(async () => { await sincronizarScripts(); await atualizarSelo(); });
chrome.storage.onChanged.addListener(async (mud, area) => {
  if (area !== 'local') return;
  if (mud.enderecos) { await sincronizarScripts(); await injetarNasAbasAbertas(); }
  if (mud.ativo) { await atualizarSelo(); if (mud.ativo.newValue) await injetarNasAbasAbertas(); }
});

/* ---------- API do Claude ---------- */
async function chamarClaude({ system, messages, maxTokens }) {
  const c = await cfg();
  if (!c.apiKey) throw new Error('Nenhuma chave da API configurada (Configurações da extensão).');
  const headers = {
    'content-type': 'application/json', 'anthropic-version': '2023-06-01',
    'x-api-key': c.apiKey, 'anthropic-dangerous-direct-browser-access': 'true'
  };
  if (c.workspaceId) headers['anthropic-workspace-id'] = c.workspaceId;
  let resp;
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers, body: JSON.stringify({ model: c.modelo, max_tokens: maxTokens || 2000, system, messages })
    });
  } catch (e) { throw new Error('Sem conexão com a API do Claude.'); }
  const corpo = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = (corpo.error && corpo.error.message) || resp.statusText;
    const amigavel = {
      400: /workspace/i.test(msg) ? 'A chave não está ligada a um workspace: preencha o Workspace ID nas Configurações.' : '',
      401: /CORS/i.test(msg) ? 'Sua organização na Anthropic não permite chamadas do navegador.' : 'Chave da API inválida.',
      404: 'Modelo não encontrado: ' + c.modelo, 429: 'Limite de uso da API atingido. Aguarde e tente de novo.',
      529: 'API do Claude sobrecarregada. Tente de novo.'
    }[resp.status];
    throw new Error((amigavel || 'Erro da API do Claude') + ` (${resp.status}: ${msg})`);
  }
  return { texto: (corpo.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''), usage: corpo.usage || null, modelo: corpo.model, parada: corpo.stop_reason };
}

// Lê o JSON da resposta. Devolve null se não der (para tentar de novo).
function extrairJson(texto) {
  const limpo = (texto || '').replace(/```(?:json)?/g, '').trim();
  const ini = limpo.indexOf('{'), fim = limpo.lastIndexOf('}');
  if (ini < 0 || fim < ini) return null;
  let obj;
  try { obj = JSON.parse(limpo.slice(ini, fim + 1)); } catch (e) { return null; }
  obj.itens = Array.isArray(obj.itens) ? obj.itens : [];
  obj.perguntas_ao_cliente = Array.isArray(obj.perguntas_ao_cliente) ? obj.perguntas_ao_cliente : [];
  return obj;
}

function erroFormato(r) {
  if (r.parada === 'max_tokens') return new Error('A resposta da IA ficou longa demais e foi cortada. Filtre um período menor e tente de novo.');
  if (r.parada === 'refusal') return new Error('A IA recusou a análise. Tente de novo ou use outro modelo.');
  const trecho = (r.texto || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  return new Error('A IA não devolveu o formato esperado' + (trecho ? ': "' + trecho + (r.texto.length > 160 ? '…"' : '"') : ' (resposta vazia)') + '. Tente de novo ou troque o modelo nas Configurações.');
}

const somarUso = (a, b) => (!a ? b : !b ? a : { input_tokens: (a.input_tokens || 0) + (b.input_tokens || 0), output_tokens: (a.output_tokens || 0) + (b.output_tokens || 0) });

const P = () => self.Lolla.services.prompts;

/* ---------- Contexto da IA (servidor local da Lolla, o mesmo do MVP) ---------- */
// Nunca impede a análise: se não der para buscar, a análise segue sem contexto e o painel avisa o motivo.
async function buscarContextos() {
  const { servidorLolla } = await cfg();
  if (!servidorLolla) return { contextos: [], aviso: 'Servidor da Lolla não configurado (Configurações → Contexto da IA): a análise foi feita sem o Contexto da IA.' };
  let resp;
  try { resp = await fetch(servidorLolla + '/api/contextos', { cache: 'no-store' }); }
  catch (e) { return { contextos: [], aviso: `O servidor da Lolla (${servidorLolla}) não respondeu: rode npm start. A análise foi feita sem o Contexto da IA.` }; }
  if (!resp.ok) return { contextos: [], aviso: `O servidor da Lolla respondeu com erro ${resp.status}. A análise foi feita sem o Contexto da IA.` };
  const corpo = await resp.json().catch(() => ({}));
  return { contextos: (corpo.contextos || []).map((c) => ({ id: c.id, titulo: c.titulo, texto: c.texto })), aviso: null };
}
const usados = (ctx) => ctx.contextos.map((c) => ({ id: c.id, titulo: c.titulo }));

const tratadores = {
  async status() {
    const c = await cfg();
    return { temChave: !!c.apiKey, iaSimulada: c.iaSimulada || !c.apiKey, modelo: c.modelo, ativo: c.ativo };
  },
  async contextos() {
    const ctx = await buscarContextos();
    return { contextos: usados(ctx), aviso: ctx.aviso };
  },
  async analisar({ payload }) {
    const ctx = await buscarContextos();
    const system = P().comContextos(P().SISTEMA_ANALISE, ctx.contextos);
    const messages = [{ role: 'user', content: P().analise(payload) }];
    let r = await chamarClaude({ system, messages, maxTokens: 8000 });
    let obj = extrairJson(r.texto);
    let uso = r.usage;
    // Se veio fora do formato (e não foi cortada), pede de novo uma vez, só o JSON
    if (!obj && r.parada !== 'max_tokens' && r.parada !== 'refusal') {
      const r2 = await chamarClaude({ system, maxTokens: 8000, messages: messages.concat(
        { role: 'assistant', content: r.texto || '(vazio)' },
        { role: 'user', content: 'Sua resposta não veio no formato pedido. Responda de novo APENAS com o JSON do formato combinado, começando em { e terminando em }, sem nenhum texto fora dele.' }) });
      uso = somarUso(uso, r2.usage);
      obj = extrairJson(r2.texto);
      if (!obj) throw erroFormato(r2);
      r = r2;
    }
    if (!obj) throw erroFormato(r);
    return { resultado: obj, usage: uso, modelo: r.modelo };
  },
  async conversar({ historico, payload, resultado }) {
    const msgs = [{ role: 'user', content: P().contextoChat(payload, resultado) }, { role: 'assistant', content: 'Entendido. Pode perguntar.' }]
      .concat(historico.map((m) => ({ role: m.papel === 'usuario' ? 'user' : 'assistant', content: m.texto })));
    const r = await chamarClaude({ system: P().SISTEMA_CHAT, messages: msgs, maxTokens: 800 });
    return { texto: r.texto, usage: r.usage };
  },
  async testar() {
    const r = await chamarClaude({ system: 'Responda apenas: ok', messages: [{ role: 'user', content: 'teste' }], maxTokens: 10 });
    return { modelo: r.modelo };
  },
  async sincronizar() { await sincronizarScripts(); await injetarNasAbasAbertas(); return {}; },
  // Abre a Lolla numa guia própria, ligada à aba (e ao quadro) do IXC que pediu
  async 'abrir-guia'(_msg, rem) {
    if (!rem || !rem.tab) throw new Error('Aba do IXC não identificada.');
    const url = chrome.runtime.getURL(`guia.html?aba=${rem.tab.id}&quadro=${rem.frameId || 0}`);
    await chrome.tabs.create({ url, index: rem.tab.index + 1, openerTabId: rem.tab.id });
    return {};
  }
};

chrome.runtime.onMessage.addListener((msg, rem, responder) => {
  const fn = tratadores[msg && msg.tipo];
  if (!fn) return false;
  fn(msg, rem).then((r) => responder(Object.assign({ ok: true }, r))).catch((e) => responder({ ok: false, erro: e.message }));
  return true;
});

/*
 * Service worker da AR Lolla.
 * - Registra o script da Lolla SÓ nos endereços do IXC cadastrados (nenhum outro site).
 * - Guarda a configuração e faz as chamadas à API do Claude (a chave nunca vai para a página do IXC).
 */
importScripts('lib/base.js', 'lib/prompts.js');

const PADRAO = { ativo: true, enderecos: [], apiKey: '', workspaceId: '', modelo: 'claude-sonnet-5-5', iaSimulada: false };
const ID_SCRIPT = 'lolla-ixc';
const ARQUIVOS_CONTEUDO = [
  'lib/base.js', 'lib/pareamento.js', 'lib/mascaramento.js', 'lib/indicadores.js', 'lib/simulador.js',
  'conteudo/leitor.js', 'conteudo/painel.js', 'conteudo/conteudo.js'
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
  return { texto: (corpo.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''), usage: corpo.usage || null, modelo: corpo.model };
}

function extrairJson(texto) {
  const limpo = texto.replace(/```(?:json)?/g, '').trim();
  const ini = limpo.indexOf('{'), fim = limpo.lastIndexOf('}');
  if (ini < 0 || fim < ini) throw new Error('A IA não devolveu o formato esperado.');
  const obj = JSON.parse(limpo.slice(ini, fim + 1));
  obj.itens = Array.isArray(obj.itens) ? obj.itens : [];
  obj.perguntas_ao_cliente = Array.isArray(obj.perguntas_ao_cliente) ? obj.perguntas_ao_cliente : [];
  return obj;
}

const P = () => self.Lolla.services.prompts;

const tratadores = {
  async status() {
    const c = await cfg();
    return { temChave: !!c.apiKey, iaSimulada: c.iaSimulada || !c.apiKey, modelo: c.modelo, ativo: c.ativo };
  },
  async analisar({ payload }) {
    const r = await chamarClaude({ system: P().SISTEMA_ANALISE, messages: [{ role: 'user', content: P().analise(payload) }] });
    return { resultado: extrairJson(r.texto), usage: r.usage, modelo: r.modelo };
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
  async sincronizar() { await sincronizarScripts(); await injetarNasAbasAbertas(); return {}; }
};

chrome.runtime.onMessage.addListener((msg, _rem, responder) => {
  const fn = tratadores[msg && msg.tipo];
  if (!fn) return false;
  fn(msg).then((r) => responder(Object.assign({ ok: true }, r))).catch((e) => responder({ ok: false, erro: e.message }));
  return true;
});

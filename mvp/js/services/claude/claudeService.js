/*
 * Integração com a API do Claude — ÚNICO lugar que conhece chave, URL e cabeçalhos.
 *
 * MVP: chamada direta do navegador ("navegador-direto"), com a chave do config.js.
 *   A chave fica exposta no cliente: usar só em ambiente local e controlado.
 * Futuro: trocar config.claude.autenticacao para "intermediario" e baseUrl para o
 *   intermediário que guarda a chave. Nada mais na aplicação precisa mudar.
 */
Lolla.services.claude = (function () {
  const cfg = () => Lolla.core.config.get().claude;
  const prompts = Lolla.services.prompts;
  const prefs = Lolla.services.armazenamento.publico;

  // Estratégias de autenticação (troca futura sem tocar no resto)
  const autenticacao = {
    'navegador-direto': (c) => ({ 'x-api-key': c.apiKey, 'anthropic-dangerous-direct-browser-access': 'true' }),
    intermediario: () => ({})
  };

  const temCredencial = () => cfg().autenticacao === 'intermediario' || !!cfg().apiKey;
  const usarSimulada = () => !temCredencial() || prefs.ler('forcar_ia_simulada') === true;

  class ErroClaude extends Error {
    constructor(status, msg) { super(msg); this.status = status; }
  }

  async function enviar({ system, messages, maxTokens }) {
    const c = cfg();
    const auth = autenticacao[c.autenticacao];
    if (!auth) throw new ErroClaude(0, 'Modo de autenticação desconhecido: ' + c.autenticacao);
    let resp;
    try {
      resp = await fetch(c.baseUrl.replace(/\/$/, '') + '/v1/messages', {
        method: 'POST',
        headers: Object.assign({ 'content-type': 'application/json', 'anthropic-version': '2023-06-01' }, auth(c)),
        body: JSON.stringify({ model: c.model, max_tokens: maxTokens || c.maxTokens, system, messages })
      });
    } catch (e) {
      throw new ErroClaude(0, 'Sem conexão com a API do Claude. Verifique a internet.');
    }
    const corpo = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = (corpo.error && corpo.error.message) || resp.statusText;
      const amigavel = {
        401: 'Chave da API inválida. Confira o config.js.',
        403: 'A chave não tem permissão para este modelo.',
        404: 'Modelo não encontrado: ' + c.model,
        429: 'Limite de uso da API atingido. Aguarde e tente de novo.',
        529: 'API do Claude sobrecarregada. Tente de novo em instantes.'
      }[resp.status];
      throw new ErroClaude(resp.status, (amigavel || 'Erro da API do Claude') + ' (' + resp.status + ': ' + msg + ')');
    }
    const texto = (corpo.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    return { texto, usage: corpo.usage || null, modelo: corpo.model };
  }

  function extrairJson(texto) {
    const limpo = texto.replace(/```(?:json)?/g, '').trim();
    const ini = limpo.indexOf('{'), fim = limpo.lastIndexOf('}');
    if (ini < 0 || fim < ini) throw new ErroClaude(0, 'A IA não devolveu o formato esperado.');
    const obj = JSON.parse(limpo.slice(ini, fim + 1));
    obj.itens = Array.isArray(obj.itens) ? obj.itens : [];
    obj.perguntas_ao_cliente = Array.isArray(obj.perguntas_ao_cliente) ? obj.perguntas_ao_cliente : [];
    return obj;
  }

  return {
    status() {
      const c = cfg();
      return { temCredencial: temCredencial(), simulada: usarSimulada(), modelo: c.model, autenticacao: c.autenticacao, baseUrl: c.baseUrl };
    },

    async analisar(payload) {
      if (usarSimulada()) return Object.assign(await Lolla.services.iaSimulada.analisar(payload), { simulado: true });
      const r = await enviar({ system: prompts.SISTEMA_ANALISE, messages: [{ role: 'user', content: prompts.analise(payload) }] });
      return { resultado: extrairJson(r.texto), usage: r.usage, simulado: false, modelo: r.modelo };
    },

    async conversar(historico, payload, resultado) {
      if (usarSimulada()) return Object.assign(await Lolla.services.iaSimulada.conversar(), { simulado: true });
      const msgs = [{ role: 'user', content: prompts.contextoChat(payload, resultado) }, { role: 'assistant', content: 'Entendido. Pode perguntar.' }]
        .concat(historico.map((m) => ({ role: m.papel === 'usuario' ? 'user' : 'assistant', content: m.texto })));
      const r = await enviar({ system: prompts.SISTEMA_CHAT, messages: msgs, maxTokens: 800 });
      return { texto: r.texto, usage: r.usage, simulado: false };
    },

    async testarConexao() {
      if (!temCredencial()) throw new ErroClaude(0, 'Nenhuma chave configurada em config.js.');
      const r = await enviar({ system: 'Responda apenas: ok', messages: [{ role: 'user', content: 'teste' }], maxTokens: 10 });
      return { ok: true, modelo: r.modelo };
    },

    ErroClaude
  };
})();

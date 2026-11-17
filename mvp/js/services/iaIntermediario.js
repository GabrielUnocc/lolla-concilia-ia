/*
 * Cliente do intermediário local da IA (intermediario/servidor.mjs).
 * O navegador NUNCA conhece a chave da API: só fala com o intermediário, que guarda a chave,
 * confere os dados, aplica os limites e devolve o custo real.
 * Para usar outra solução da TI, basta apontar o endereço para um serviço com o mesmo contrato:
 *   GET  /v1/status       -> { disponivel, motivo, modelos[], dolar, limites{porAnalise, porDia, gastoHoje, saldoHoje}, tokensPrompt, caracteresPorToken, maxTokensSaida }
 *   POST /v1/interpretar  -> { modelo, analiseId, payload } => { resultado{itens[]}, usage, custoReais, gastoHoje, saldoHoje, gastoAnalise }
 */
(function (g) {
  const L = g.Lolla;
  L.services = L.services || {};
  const CHAVE_URL = 'lolla:analise:intermediario';

  function enderecoPadrao() {
    const cfg = (g.LOLLA_CONFIG && g.LOLLA_CONFIG.intermediario && g.LOLLA_CONFIG.intermediario.url) || '';
    if (cfg) return cfg;
    if (/^https?:$/.test(location.protocol) && /^(127\.0\.0\.1|localhost)$/.test(location.hostname)) return location.origin;   // página servida pelo próprio intermediário
    return 'http://127.0.0.1:8787';
  }
  function endereco() {
    try { return localStorage.getItem(CHAVE_URL) || enderecoPadrao(); } catch (e) { return enderecoPadrao(); }
  }
  function definirEndereco(url) {
    const u = String(url || '').trim().replace(/\/+$/, '');
    if (u && !/^https?:\/\/[^\s/]+(:\d+)?$/.test(u)) throw new Error('Endereço inválido. Exemplo: http://127.0.0.1:8787');
    try { if (u) localStorage.setItem(CHAVE_URL, u); else localStorage.removeItem(CHAVE_URL); } catch (e) { /* sem armazenamento: vale só nesta sessão */ }
    return endereco();
  }

  async function pedir(caminho, opcoes) {
    let resp;
    try {
      resp = await fetch(endereco() + caminho, Object.assign({ cache: 'no-store' }, opcoes));
    } catch (e) {
      const err = new Error(`Intermediário da IA fora do ar em ${endereco()}. Inicie com "npm run intermediario" ou confira o endereço.`);
      err.codigo = 'offline';
      throw err;
    }
    const corpo = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const err = new Error(corpo.motivo || `Erro ${resp.status} no intermediário.`);
      err.codigo = corpo.erro || String(resp.status); err.corpo = corpo; err.status = resp.status;
      throw err;
    }
    return corpo;
  }

  const status = () => pedir('/v1/status', { method: 'GET' });
  const interpretar = (modelo, analiseId, payload) => pedir('/v1/interpretar', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ modelo, analiseId, payload })
  });

  // Estimativa local (antes de enviar), com as mesmas regras do intermediário
  function estimar(st, modelo, partes) {
    const m = st.modelos.find((x) => x.id === modelo);
    if (!m) return null;
    const cpt = st.caracteresPorToken || 3.2;
    const PREFIXO = 130;   // texto fixo que o intermediário põe antes dos dados
    const entrada = partes.reduce((a, p) => a + st.tokensPrompt + Math.ceil((JSON.stringify(p).length + PREFIXO) / cpt), 0);
    const saidaProvavel = partes.reduce((a, p) => a + Math.min(st.maxTokensSaida, 120 + p.itens.length * 140), 0);
    const saidaMaxima = partes.length * st.maxTokensSaida;
    const custo = (tin, tout) => ((tin * m.entradaUsdMtok + tout * m.saidaUsdMtok) / 1e6) * st.dolar;
    return { entrada, saidaProvavel, saidaMaxima, custoProvavel: custo(entrada, saidaProvavel), custoMaximo: custo(entrada, saidaMaxima),
      maximoPorParte: partes.map((p) => custo(st.tokensPrompt + Math.ceil((JSON.stringify(p).length + PREFIXO) / cpt), st.maxTokensSaida)) };
  }

  L.services.iaIntermediario = { status, interpretar, estimar, endereco, definirEndereco };
})(typeof self !== 'undefined' ? self : globalThis);

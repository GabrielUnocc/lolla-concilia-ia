/*
 * Núcleo: namespace, configuração, formatação e store de estado.
 * Scripts clássicos (sem módulos ES) para abrir direto pelo arquivo, sem servidor.
 */
window.Lolla = window.Lolla || { core: {}, services: {}, domain: {}, ui: { views: {} } };

/* ---------- Configuração (único ponto que lê window.LOLLA_CONFIG) ---------- */
Lolla.core.config = (function () {
  const padrao = {
    claude: { apiKey: '', model: 'claude-sonnet-5-5', baseUrl: 'https://api.anthropic.com', maxTokens: 2000, autenticacao: 'navegador-direto' },
    ixc: { modo: 'simulado', latenciaMinMs: 300, latenciaMaxMs: 1200, taxaErro: 0.05 },
    custo: { dolarEmReais: 5.5, precoEntradaUsd: 2, precoSaidaUsd: 10 }
  };
  const lido = window.LOLLA_CONFIG || {};
  const cfg = {
    claude: Object.assign({}, padrao.claude, lido.claude),
    ixc: Object.assign({}, padrao.ixc, lido.ixc),
    custo: Object.assign({}, padrao.custo, lido.custo),
    arquivoEncontrado: !!window.LOLLA_CONFIG
  };
  return {
    get: () => cfg,
    // Ajustes feitos na tela de Configurações (não alteram o arquivo)
    ajustarIxc: (parcial) => Object.assign(cfg.ixc, parcial)
  };
})();

/* ---------- Formatação ---------- */
Lolla.core.fmt = (function () {
  const moeda = (centavos) => {
    const v = (centavos || 0) / 100;
    return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const reais = (centavos) => 'R$ ' + moeda(centavos);
  // "1.250,50" -> 125050 (centavos)
  const centavosBR = (s) => {
    s = String(s == null ? '' : s).trim();
    if (!s) return 0;
    return Math.round(Number(s.replace(/\./g, '').replace(',', '.')) * 100);
  };
  // "02/11/2026" <-> "2026-11-02"
  const isoDeBR = (d) => { const [dd, mm, aa] = String(d || '').split('/'); return aa ? `${aa}-${mm}-${dd}` : ''; };
  const brDeIso = (d) => { const [aa, mm, dd] = String(d || '').split('-'); return dd ? `${dd}/${mm}/${aa}` : ''; };
  const dia = (iso) => { const [a, m, d] = iso.split('-').map(Number); return Date.UTC(a, m - 1, d) / 864e5; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dataHora = (ts) => new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const pct = (x) => (isFinite(x) ? Math.round(x * 100) : 0) + '%';
  return { moeda, reais, centavosBR, isoDeBR, brDeIso, dia, esc, dataHora, pct };
})();

/* ---------- Store de estado (pub/sub simples) ---------- */
Lolla.core.criarStore = function (inicial) {
  let estado = inicial;
  const ouvintes = new Set();
  return {
    get: () => estado,
    set(parcial) {
      estado = Object.assign({}, estado, typeof parcial === 'function' ? parcial(estado) : parcial);
      ouvintes.forEach((fn) => fn(estado));
    },
    assinar(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); }
  };
};

Lolla.core.store = Lolla.core.criarStore({
  desbloqueado: false,
  aba: 'conciliacao',
  contas: [],
  filtros: { contaId: null, dataIni: '2026-11-03', dataFim: '2026-11-06' },
  carregando: false,
  erro: null,
  movimentacao: [],
  extrato: [],
  pareamento: null,
  selecao: { mov: [], ext: [] },
  destaque: [],          // ids destacados por um card da IA ("M:12", "E:7")
  analise: null,         // { id, resultado, simulado, usage }
  analisando: false,
  erroIA: null,
  chat: [],
  conversando: false,
  historico: [],         // análises salvas (carregadas ao abrir Indicadores/Histórico)
  cenario: 'padrao',     // cenário de teste carregado na base simulada
  testeClaude: '',
  aviso: null            // { tipo: 'ok'|'erro', texto }
});

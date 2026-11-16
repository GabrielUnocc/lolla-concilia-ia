/*
 * Base compartilhada da extensão (conteúdo e service worker): namespace e formatação pt-BR.
 * Os arquivos de lib/ são cópias do MVP (mvp/js/domain e mvp/js/services/claude).
 */
(function (g) {
  g.Lolla = g.Lolla || { core: {}, services: {}, domain: {}, ui: {} };
})(typeof self !== 'undefined' ? self : window);

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

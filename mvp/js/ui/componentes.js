/*
 * Componentes visuais reutilizáveis (funções que devolvem HTML).
 * Todo texto variável passa por esc() antes de ir para a tela.
 */
Lolla.ui.c = (function () {
  const { esc, reais } = Lolla.core.fmt;

  const kpi = (rotulo, valor, sub, tom) =>
    `<div class="kpi ${tom || ''}"><div class="kpi-rot">${esc(rotulo)}</div><div class="kpi-val">${valor}</div>${sub ? `<div class="kpi-sub">${esc(sub)}</div>` : ''}</div>`;

  const selo = (texto, tom) => `<span class="selo ${tom || ''}">${esc(texto)}</span>`;

  const spinner = (texto) => `<div class="carregando"><span class="giro"></span>${esc(texto || 'Carregando…')}</div>`;

  const vazio = (texto) => `<div class="vazio">${esc(texto)}</div>`;

  const tomStatus = {
    conciliado: 'cinza', identificador: 'verde', 'valor + data': 'verde', lote: 'azul', duplicado: 'vermelho', sobra: 'laranja'
  };

  // Barras de diferença por dia (positivo = IXC maior, negativo = banco maior)
  function graficoDiferenca(porDia) {
    if (!porDia.length) return vazio('Sem dados no período.');
    const larg = 640, alt = 200, mx = 56, my = 22;
    const max = Math.max(1, ...porDia.map((d) => Math.abs(d.dif)));
    const passo = (larg - mx - 10) / porDia.length;
    const meio = alt / 2;
    const y = (v) => meio - (v / max) * (meio - my);
    const barras = porDia.map((d, k) => {
      const x = mx + k * passo + passo * 0.2, w = passo * 0.6;
      const y0 = Math.min(y(d.dif), meio), h = Math.max(1, Math.abs(y(d.dif) - meio));
      const cor = d.dif > 0 ? 'var(--laranja)' : d.dif < 0 ? 'var(--azul)' : 'var(--cinza)';
      const [, mm, dd] = d.data.split('-');
      return `<g><title>${dd}/${mm}: IXC − banco = ${reais(d.dif)}</title>
        <rect x="${x}" y="${y0}" width="${w}" height="${h}" fill="${cor}" rx="2"></rect>
        <text x="${x + w / 2}" y="${alt - 4}" text-anchor="middle" class="eixo">${dd}/${mm}</text>
        ${d.dif ? `<text x="${x + w / 2}" y="${d.dif > 0 ? y0 - 4 : y0 + h + 12}" text-anchor="middle" class="rotulo">${esc(reais(d.dif).replace('R$ ', ''))}</text>` : ''}</g>`;
    }).join('');
    return `<svg viewBox="0 0 ${larg} ${alt + 4}" class="grafico" role="img" aria-label="Diferença por dia">
      <line x1="${mx}" x2="${larg - 10}" y1="${meio}" y2="${meio}" class="zero"></line>
      <text x="${mx - 6}" y="${y(max) + 4}" text-anchor="end" class="eixo">+${esc(reais(max).replace('R$ ', ''))}</text>
      <text x="${mx - 6}" y="${meio + 4}" text-anchor="end" class="eixo">0</text>
      <text x="${mx - 6}" y="${y(-max) + 4}" text-anchor="end" class="eixo">−${esc(reais(max).replace('R$ ', ''))}</text>
      ${barras}</svg>
      <div class="legenda"><span><i style="background:var(--laranja)"></i>IXC maior</span><span><i style="background:var(--azul)"></i>Banco maior</span></div>`;
  }

  return { kpi, selo, spinner, vazio, tomStatus, graficoDiferenca };
})();

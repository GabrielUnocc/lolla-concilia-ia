/*
 * Modo Análise — componentes visuais (funções que devolvem HTML). Todo texto variável passa por esc().
 */
(function (g) {
  const L = g.Lolla;
  L.ui = L.ui || {};
  L.ui.analise = L.ui.analise || {};
  const N = () => L.domain.analise.norm;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reais = (c) => (c == null || !isFinite(c) ? '—' : 'R$ ' + N().reais(c));
  const br = (d) => (d ? N().brDeIso(d) : '—');
  const tamanho = (b) => (b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1).replace('.', ',') + ' KB' : (b / 1048576).toFixed(1).replace('.', ',') + ' MB');
  const brl = (v, casas = 4) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: casas });

  const TOM_CLASSE = { conciliado: 'verde', lote: 'verde', tarifa: 'amarelo', data: 'laranja', duplicado: 'roxo', valor: 'vermelho', so_banco: 'azul', so_ixc: 'laranja', sem_correspondencia: 'cinza' };
  const STATUS = { ok: ['Conciliado', 'verde'], atencao: ['Atenção', 'amarelo'], divergente: ['Divergente', 'vermelho'], fora_escopo: ['Fora do escopo', 'cinza'] };
  const selo = (texto, tom) => `<span class="selo ${tom || ''}">${esc(texto)}</span>`;
  const seloClasse = (cls) => selo(L.domain.analise.motor.CLASSIFICACOES[cls] || cls, TOM_CLASSE[cls]);
  const seloStatus = (st) => selo((STATUS[st] || [st])[0], (STATUS[st] || [])[1]);
  const spinner = (t) => `<span class="carregando"><span class="giro" aria-hidden="true"></span>${esc(t || 'Carregando…')}</span>`;
  const alerta = (tipo, html) => `<div class="alerta ${tipo}" role="${tipo === 'erro' ? 'alert' : 'status'}">${html}</div>`;
  const lista = (itens) => `<ul>${itens.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;

  // tabela simples: colunas [{t: 'Título', num?: bool, quebra?: bool}], linhas [[html]]
  function tabela(colunas, linhas, vazio) {
    if (!linhas.length) return `<div class="vazio">${esc(vazio || 'Nada para mostrar.')}</div>`;
    return `<div class="rolagem"><table><thead><tr>${colunas.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.t)}</th>`).join('')}</tr></thead>
      <tbody>${linhas.map((l) => `<tr>${l.map((v, k) => `<td class="${colunas[k].num ? 'num' : ''}${colunas[k].quebra ? ' quebra' : ''}">${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  L.ui.analise.c = { esc, reais, br, brl, tamanho, selo, seloClasse, seloStatus, spinner, alerta, lista, tabela, TOM_CLASSE };
})(typeof self !== 'undefined' ? self : globalThis);

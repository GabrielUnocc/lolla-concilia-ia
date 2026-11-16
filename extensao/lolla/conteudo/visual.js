/*
 * Visual modernizado da Conciliação (opcional, liga/desliga no botão da extensão).
 * Estilo vidro fosco (mesma linguagem do Flowly), com versão clara e escura que segue o tema do IXC.
 *
 * Regras de segurança:
 * - Só aparência: cor, transparência (vidro fosco), cantos, sombras. Nada de tamanho, posição,
 *   espaçamento, display ou eventos — o layout e a responsividade continuam os do IXC.
 * - Sem !important: qualquer cor que o próprio IXC aplique (verde/laranja, linha selecionada) continua valendo.
 * - Não toca em dados, campos, botões ou scripts do IXC. Desligar remove tudo na hora.
 * - Escopo: só a tela que tem as grades da conciliação (html[data-lolla-visual]).
 */
Lolla.visual = (function () {
  const ID = 'lolla-visual-css';
  const R = 'html[data-lolla-visual="on"]';
  const GRADE = 'table[id^="grid_lancamentos_"]';
  const CAIXA = `.flexigrid:has(${GRADE})`;

  const CSS = `
  /* ---------- Tokens (claro) ---------- */
  ${R} {
    --lv-cena: radial-gradient(900px 360px at 6% 0%, rgba(47,111,237,.16), transparent 62%),
               radial-gradient(760px 340px at 100% 100%, rgba(56,189,248,.14), transparent 60%),
               radial-gradient(620px 300px at 55% 40%, rgba(139,92,246,.07), transparent 65%);
    --lv-vidro: rgba(255,255,255,.58);
    --lv-vidro-forte: rgba(255,255,255,.80);
    --lv-vidro-suave: rgba(255,255,255,.34);
    --lv-borda: rgba(255,255,255,.90);
    --lv-borda-suave: rgba(150,170,215,.28);
    --lv-desfoque: blur(22px) saturate(180%) brightness(1.03);
    --lv-sombra: 0 12px 40px rgba(40,70,160,.12), 0 1px 0 rgba(255,255,255,.95) inset, 0 0 0 1px rgba(255,255,255,.55) inset;
    --lv-titulo: linear-gradient(135deg, rgba(18,53,95,.92), rgba(47,111,237,.86));
    --lv-cab-texto: #46566a;
    --lv-linha: rgba(18,53,95,.06);
    --lv-hover: rgba(47,111,237,.07);
    --lv-campo: rgba(255,255,255,.62);
    --lv-campo-borda: rgba(18,53,95,.16);
    --lv-x: #d0473a; --lv-ok: #2e8b57;
  }
  /* ---------- Tokens (escuro: segue o tema escuro do IXC) ---------- */
  ${R}[data-lolla-tema="escuro"] {
    --lv-cena: radial-gradient(900px 360px at 6% 0%, rgba(91,147,247,.18), transparent 62%),
               radial-gradient(760px 340px at 100% 100%, rgba(56,189,248,.10), transparent 60%),
               radial-gradient(620px 300px at 55% 40%, rgba(139,92,246,.10), transparent 65%);
    --lv-vidro: rgba(16,22,40,.62);
    --lv-vidro-forte: rgba(20,27,50,.86);
    --lv-vidro-suave: rgba(28,36,66,.42);
    --lv-borda: rgba(255,255,255,.09);
    --lv-borda-suave: rgba(120,140,200,.18);
    --lv-desfoque: blur(22px) saturate(160%) brightness(1.08);
    --lv-sombra: 0 12px 40px rgba(0,0,0,.55), 0 1px 0 rgba(255,255,255,.06) inset, 0 0 0 1px rgba(255,255,255,.04) inset;
    --lv-titulo: linear-gradient(135deg, rgba(31,58,120,.95), rgba(66,120,235,.80));
    --lv-cab-texto: #a9b5cc;
    --lv-linha: rgba(255,255,255,.05);
    --lv-hover: rgba(91,147,247,.12);
    --lv-campo: rgba(255,255,255,.06);
    --lv-campo-borda: rgba(255,255,255,.14);
    --lv-x: #ff7a6b; --lv-ok: #4fd18b;
  }

  /* ---------- Cena atrás das grades ---------- */
  ${R} [id^="grids_aba_"] { background-image: var(--lv-cena); border-radius: 18px; }

  /* ---------- Grades em vidro ---------- */
  ${R} ${CAIXA} {
    background-color: var(--lv-vidro);
    -webkit-backdrop-filter: var(--lv-desfoque); backdrop-filter: var(--lv-desfoque);
    border-color: var(--lv-borda);
    border-radius: 16px;
    box-shadow: var(--lv-sombra);
  }
  ${R} ${CAIXA} .mDiv { background-image: var(--lv-titulo); background-color: transparent; border-radius: 16px 16px 0 0; }
  ${R} ${CAIXA} .mDiv .ftitle { color: #fff; letter-spacing: .02em; background-color: transparent; }
  ${R} ${CAIXA} .hDiv, ${R} ${CAIXA} .hDiv th { background-color: var(--lv-vidro-forte); }
  ${R} ${CAIXA} .hDiv th { color: var(--lv-cab-texto); border-color: var(--lv-borda-suave); }
  ${R} ${CAIXA} .bDiv { background-color: transparent; }
  ${R} ${GRADE} tbody tr > td { border-color: var(--lv-linha); }
  /* hover só em linha NÃO selecionada: o laranja/verde nativo do IXC na seleção nunca é coberto */
  ${R} ${GRADE} tbody tr:not(:has(input[type="checkbox"]:checked)):not(.trSelected):hover > td { background-color: var(--lv-hover); }
  ${R} ${GRADE} td[abbr$=".conciliado"] .fa-times { color: var(--lv-x); }
  ${R} ${GRADE} td[abbr$=".conciliado"] .fa-check, ${R} ${GRADE} td[abbr$=".conciliado"] .fa-circle-check { color: var(--lv-ok); }
  ${R} ${GRADE} td[abbr$=".credito"], ${R} ${GRADE} td[abbr$=".debito"] { font-variant-numeric: tabular-nums; }

  /* A cor da seleção (verde quando bate, laranja quando não) é a do próprio IXC: a Lolla não sobrepõe. */

  /* ---------- Filtros e rodapé ---------- */
  ${R} [id^="box_search_tab_"] select, ${R} [id^="box_search_tab_"] input[type="text"],
  ${R} [id^="rodape_aba_"] input[type="text"] {
    background-color: var(--lv-campo);
    border-radius: 10px; border-color: var(--lv-campo-borda);
    box-shadow: inset 0 1px 2px rgba(18,53,95,.06);
  }
  ${R}[data-lolla-tema="escuro"] [id^="rodape_aba_"] input[type="text"],
  ${R}[data-lolla-tema="escuro"] [id^="box_search_tab_"] input[type="text"] { color: #e6ecf7; }
  ${R} [id^="rodape_aba_"] input[type="text"] { font-variant-numeric: tabular-nums; font-weight: 600; }
  ${R} [id^="rodape_aba_"] > div {
    background-color: var(--lv-vidro-suave); border-radius: 14px;
    box-shadow: 0 0 0 1px var(--lv-borda-suave) inset;
  }
  `;

  /* ---------- Tema do IXC (claro/escuro) ---------- */
  function luminancia(cor) {
    const m = (cor || '').match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
    if (!m) return null;
    if (m[4] !== undefined && Number(m[4]) < 0.5) return null; // transparente: não decide
    const c = [m[1], m[2], m[3]].map((v) => { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  // Decide pelo próprio IXC: classe de tema escuro, cor do texto das grades ou fundo da janela da conciliação.
  // Lê só cores que a Lolla NÃO altera (texto das células e fundo dos elementos acima das grades).
  function detectarTema() {
    const h = document.documentElement, b = document.body || h;
    const marcas = [h.className, b.className, h.getAttribute('data-theme'), b.getAttribute('data-theme'),
      h.getAttribute('data-bs-theme'), b.getAttribute('data-bs-theme')].join(' ');
    if (/\b(dark|escuro|noturno|night)\b|dark-?mode|tema-?escuro|theme-?dark/i.test(marcas)) return 'escuro';
    const td = document.querySelector(`${GRADE} tbody td`);
    if (td) { const l = luminancia(getComputedStyle(td).color); if (l !== null) return l > 0.45 ? 'escuro' : 'claro'; }
    let el = document.querySelector('[id^="grids_aba_"]');
    for (let i = 0; el && i < 12; i++, el = el.parentElement) {
      const l = luminancia(getComputedStyle(el).backgroundColor);
      if (l !== null) return l < 0.2 ? 'escuro' : 'claro';
    }
    return 'claro';
  }
  function marcarTema(tema) {
    const raiz = document.documentElement;
    if (raiz.getAttribute('data-lolla-tema') !== tema) raiz.setAttribute('data-lolla-tema', tema);
  }

  function aplicar() {
    const raiz = document.documentElement;
    if (raiz.getAttribute('data-lolla-visual') !== 'on') raiz.setAttribute('data-lolla-visual', 'on');
    if (!document.getElementById(ID)) {
      const st = document.createElement('style');
      st.id = ID; st.textContent = CSS;
      (document.head || raiz).appendChild(st);
    }
  }

  function remover() {
    const st = document.getElementById(ID); if (st) st.remove();
    document.documentElement.removeAttribute('data-lolla-visual');
    document.documentElement.removeAttribute('data-lolla-sel');
    document.documentElement.removeAttribute('data-lolla-tema');
  }

  // Mantido por compatibilidade: a cor da seleção agora é só a nativa do IXC.
  function atualizarSelecao() {}

  return { aplicar, remover, atualizarSelecao, detectarTema, marcarTema };
})();

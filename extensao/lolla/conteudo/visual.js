/*
 * Visual modernizado da Conciliação Manual (opcional, liga/desliga no botão da extensão).
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
  ${R} [id^="grids_aba_"] {
    background-image: radial-gradient(1100px 380px at 8% 0%, rgba(47,111,209,.12), transparent 60%),
                      radial-gradient(900px 360px at 100% 100%, rgba(224,123,36,.10), transparent 60%);
    border-radius: 14px;
  }
  ${R} ${CAIXA} {
    background-color: rgba(255,255,255,.62);
    -webkit-backdrop-filter: blur(12px) saturate(140%); backdrop-filter: blur(12px) saturate(140%);
    border-color: rgba(255,255,255,.75);
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(18,53,95,.12), inset 0 1px 0 rgba(255,255,255,.6);
  }
  ${R} ${CAIXA} .mDiv {
    background-image: linear-gradient(135deg, rgba(18,53,95,.94), rgba(31,95,168,.88));
    border-radius: 12px 12px 0 0;
  }
  ${R} ${CAIXA} .mDiv .ftitle { color: #fff; letter-spacing: .02em; background-color: transparent; }
  ${R} ${CAIXA} .hDiv, ${R} ${CAIXA} .hDiv th { background-color: rgba(247,249,251,.72); }
  ${R} ${CAIXA} .hDiv th { color: #46566a; }
  ${R} ${GRADE} tbody tr > td { border-color: rgba(18,53,95,.06); }
  ${R} ${GRADE} tbody tr:hover > td { background-color: rgba(47,111,209,.06); }
  ${R} ${GRADE} td[abbr$=".conciliado"] .fa-times { color: #d0473a; }
  ${R} ${GRADE} td[abbr$=".conciliado"] .fa-check, ${R} ${GRADE} td[abbr$=".conciliado"] .fa-circle-check { color: #2e8b57; }
  ${R} ${GRADE} td[abbr$=".credito"], ${R} ${GRADE} td[abbr$=".debito"] { font-variant-numeric: tabular-nums; }

  /* Seleção como no protótipo: verde quando os totais selecionados batem, laranja quando não */
  ${R}[data-lolla-sel="ok"] ${GRADE} tbody tr:has(input[type="checkbox"]:checked) > td { background-color: rgba(46,139,87,.30); }
  ${R}[data-lolla-sel="nok"] ${GRADE} tbody tr:has(input[type="checkbox"]:checked) > td { background-color: rgba(224,123,36,.30); }

  ${R} [id^="box_search_tab_"] select, ${R} [id^="box_search_tab_"] input[type="text"],
  ${R} [id^="rodape_aba_"] input[type="text"] {
    border-radius: 8px; border-color: rgba(18,53,95,.18);
    box-shadow: inset 0 1px 2px rgba(18,53,95,.06);
  }
  ${R} [id^="rodape_aba_"] input[type="text"] { font-variant-numeric: tabular-nums; font-weight: 600; }
  ${R} [id^="rodape_aba_"] > div { border-radius: 12px; }
  `;

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
  }

  // Lê só os totais selecionados do rodapé para colorir a seleção (não altera nada)
  function atualizarSelecao(rodape) {
    const m = rodape.selecionadoMov, e = rodape.selecionadoExt;
    const algum = (m != null && m !== 0) || (e != null && e !== 0);
    const estado = !algum ? '' : (m || 0) === (e || 0) ? 'ok' : 'nok';
    const raiz = document.documentElement;
    if ((raiz.getAttribute('data-lolla-sel') || '') !== estado) {
      if (estado) raiz.setAttribute('data-lolla-sel', estado); else raiz.removeAttribute('data-lolla-sel');
    }
  }

  return { aplicar, remover, atualizarSelecao };
})();

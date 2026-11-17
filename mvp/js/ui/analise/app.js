/*
 * Modo Análise — estado, renderização e eventos (delegação por data-acao).
 */
(function (g) {
  const L = g.Lolla;
  const UI = L.ui.analise;
  const c = UI.c;
  const $ = (s) => document.querySelector(s);

  UI.estado = {
    arquivos: { francesinha: UI.arquivos.vazio(), ofx: UI.arquivos.vazio(), ixc: UI.arquivos.vazio() },
    banco: { deteccao: null, manual: null, credito: null, creditoDe: null },
    abaDados: 'francesinha',
    analise: null, rodando: false, erroAnalise: '',
    filtros: { grupo: 'todos', busca: '', etapa: '', status: '' },
    abertos: new Set(), limite: 150,
    ia: { status: null, erroStatus: '', verificando: false, modelo: null, preparo: null, consentimento: false, enviando: false, progresso: '', resultados: {}, problemas: [], custos: [], observacoes: [] }
  };

  const PARTES = {
    arquivos: () => UI.arquivos.telaArquivos(),
    banco: () => UI.arquivos.telaBanco(),
    dados: () => UI.arquivos.telaDados(),
    resultado: () => UI.resultados.tela(),
    ia: () => UI.ia.tela()
  };

  function renderParte(nome) {
    const el = document.getElementById('etapa-' + nome);
    if (!el) return;
    const foco = document.activeElement && el.contains(document.activeElement) && document.activeElement.id ? document.activeElement.id : null;
    el.innerHTML = PARTES[nome]();
    if (foco && document.getElementById(foco)) document.getElementById(foco).focus();
  }
  UI.renderParte = renderParte;
  UI.render = () => Object.keys(PARTES).forEach(renderParte);

  function renderLista() {
    const l = $('#lista-itens'), ch = $('#chips');
    if (l) l.innerHTML = UI.resultados.lista();
    if (ch) ch.innerHTML = UI.resultados.chips();
  }

  let tAviso = null;
  UI.avisar = (tipo, texto) => {
    let t = $('.toast');
    if (!t) { t = document.createElement('div'); t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.className = 'toast ' + tipo; t.textContent = texto;
    clearTimeout(tAviso); tAviso = setTimeout(() => t.remove(), 4500);
  };
  UI.dialogo = (texto, html) => {
    const f = document.createElement('div');
    f.className = 'dialogo-fundo';
    f.innerHTML = `<div class="dialogo" role="dialog" aria-modal="true"><p>${c.esc(texto)}</p>${html}<div class="linha-form" style="justify-content:flex-end"><button class="btn primario" data-fechar>Fechar</button></div></div>`;
    f.addEventListener('click', (ev) => { if (ev.target === f || ev.target.closest('[data-fechar]')) f.remove(); });
    document.body.appendChild(f);
    const ta = f.querySelector('textarea'); if (ta) ta.select();
  };

  /* ---------- Eventos ---------- */
  document.addEventListener('click', (ev) => {
    const alvo = ev.target.closest('[data-acao]');
    if (!alvo || alvo.disabled || alvo.tagName === 'SELECT' || alvo.tagName === 'INPUT') return;
    const e = UI.estado;
    switch (alvo.dataset.acao) {
      case 'limpar': return UI.arquivos.limpar(alvo.dataset.tipo);
      case 'aba-dados': e.abaDados = alvo.dataset.aba; return renderParte('dados');
      case 'analisar': return UI.resultados.executar();
      case 'grupo': e.filtros.grupo = alvo.dataset.grupo; e.limite = UI.resultados.POR_PAGINA; return renderLista();
      case 'mais': e.limite += UI.resultados.POR_PAGINA; return renderLista();
      case 'abrir-todos': L.domain.analise.resultado.filtrar(e.analise, e.filtros, e.analise.indice).slice(0, e.limite).forEach((i) => e.abertos.add(i.id)); return renderLista();
      case 'fechar-todos': e.abertos.clear(); return renderLista();
      case 'copiar': return UI.resultados.copiar();
      case 'csv': return UI.resultados.exportarCsv();
      case 'ia-verificar': {
        const u = $('#ia-url');
        try { if (u) L.services.iaIntermediario.definirEndereco(u.value); } catch (err) { return UI.avisar('erro', err.message); }
        return UI.ia.verificar();
      }
      case 'ia-preparar': return UI.ia.preparar();
      case 'ia-enviar': return UI.ia.enviar();
    }
  });

  // Abrir/fechar um item renderiza o detalhe só quando precisa (listas grandes ficam leves)
  document.addEventListener('toggle', (ev) => {
    const d = ev.target;
    if (!d.matches || !d.matches('details.item')) return;
    const id = d.dataset.item, e = UI.estado;
    if (d.open && !e.abertos.has(id)) { e.abertos.add(id); d.outerHTML = UI.resultados.htmlDoItem(id); }
    else if (!d.open) e.abertos.delete(id);
  }, true);

  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.matches('input[type=file][data-arquivo]')) { if (el.files[0]) UI.arquivos.receber(el.dataset.arquivo, el.files[0]); return; }
    if (UI.ia.aoMudar(el)) return;
    if (el.dataset.acao === 'filtro-etapa') { UI.estado.filtros.etapa = el.value; return renderLista(); }
    if (el.dataset.acao === 'filtro-status') { UI.estado.filtros.status = el.value; return renderLista(); }
    UI.arquivos.aoMudar(el);
  });

  let tBusca = null;
  document.addEventListener('input', (ev) => {
    if (ev.target.id !== 'busca') return;
    clearTimeout(tBusca);
    tBusca = setTimeout(() => { UI.estado.filtros.busca = ev.target.value; UI.estado.limite = UI.resultados.POR_PAGINA; renderLista(); }, 200);
  });

  // Arrastar e soltar em cada área
  ['dragenter', 'dragover'].forEach((t) => document.addEventListener(t, (ev) => {
    const d = ev.target.closest && ev.target.closest('[data-drop]');
    if (!d) return;
    ev.preventDefault(); d.classList.add('arrastando');
  }));
  document.addEventListener('dragleave', (ev) => { const d = ev.target.closest && ev.target.closest('[data-drop]'); if (d && !d.contains(ev.relatedTarget)) d.classList.remove('arrastando'); });
  document.addEventListener('drop', (ev) => {
    const d = ev.target.closest && ev.target.closest('[data-drop]');
    ev.preventDefault();               // nunca deixa o navegador abrir o arquivo solto fora da área
    if (!d) return;
    d.classList.remove('arrastando');
    const f = ev.dataTransfer.files[0];
    if (f) UI.arquivos.receber(d.dataset.drop, f);
  });
  document.addEventListener('dragover', (ev) => ev.preventDefault());

  /* ---------- Início ---------- */
  UI.render();
  UI.ia.verificar();
})(typeof self !== 'undefined' ? self : globalThis);

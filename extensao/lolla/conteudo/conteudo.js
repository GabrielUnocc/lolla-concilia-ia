/*
 * Controlador da Lolla na página do IXC.
 * - Só aparece quando a tela tem as grades da Conciliação Manual.
 * - Com o painel aberto, relê a tela sozinho a cada mudança (sem botão de atualizar).
 * - Liga/desliga pelo botão da extensão.
 */
(function () {
  if (window.__lollaCarregada) return;
  window.__lollaCarregada = true;

  const fmt = Lolla.core.fmt;
  const tela = Lolla.ixcTela;
  const s = {
    ativo: false, visualModerno: true, aberto: false, expandido: false, leitura: null, pareamento: null, ind: null, conferencia: null, assinatura: '',
    analise: null, analisando: false, erroIA: null, chat: [], conversando: false, status: null, atualizadoEm: null, aviso: null, tema: 'claro'
  };
  let host = null, raiz = null, observador = null, relogio = null, espera = null;
  let animando = false, renderPendente = false;

  /* ---------- Montagem do painel ---------- */
  function montar() {
    host = document.createElement('div');
    host.id = 'lolla-host';
    host.setAttribute('data-tema', s.tema);
    raiz = host.attachShadow({ mode: 'open' });
    raiz.innerHTML = `<style>${Lolla.painel.CSS}</style><div id="r"></div>`;
    document.documentElement.appendChild(host);
    raiz.addEventListener('click', aoClicar);
    raiz.addEventListener('submit', aoEnviar);
  }
  function desmontar() { if (host) host.remove(); host = raiz = null; }

  function render() {
    if (!raiz) return;
    if (animando) { renderPendente = true; return; }
    const entrada = raiz.getElementById('lolla-chat');
    const rascunho = entrada ? entrada.value : '';
    const focado = raiz.activeElement && raiz.activeElement.id === 'lolla-chat';
    const corpo = raiz.querySelector('.corpo');
    const rolagem = corpo ? corpo.scrollTop : 0;
    raiz.getElementById('r').innerHTML = s.aberto ? Lolla.painel.painel(s, { modo: 'flutuante', expandido: s.expandido }) : Lolla.painel.lancador(s);
    const nova = raiz.getElementById('lolla-chat');
    if (nova) { nova.value = rascunho; if (focado) nova.focus(); }
    const c2 = raiz.querySelector('.corpo'); if (c2) c2.scrollTop = rolagem;
    const msgs = raiz.querySelector('.msgs'); if (msgs) msgs.scrollTop = msgs.scrollHeight;
    enviarEstado();
  }

  /* ---------- Animações: painel encolhendo até o botão + gotinhas azuis ---------- */
  const semMovimento = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  async function animarSaida() {
    const p = raiz && raiz.querySelector('.painel');
    if (!p || !p.animate || semMovimento()) return;
    // Encolhe em direção a onde o botão "Lolla" vai aparecer (canto inferior direito)
    const r = p.getBoundingClientRect();
    const alvoX = innerWidth - 22 - 55, alvoY = innerHeight - 22 - 22;
    p.style.transformOrigin = `${alvoX - r.left}px ${alvoY - r.top}px`;
    animando = true;
    try {
      await p.animate([
        { transform: 'scale(1)', opacity: 1, filter: 'blur(0px)' },
        { transform: 'scale(.5)', opacity: .75, filter: 'blur(1px)', offset: .6 },
        { transform: 'scale(.04)', opacity: 0, filter: 'blur(6px)' }
      ], { duration: 440, easing: 'cubic-bezier(.55,0,.7,.2)', fill: 'forwards' }).finished;
    } catch (e) { /* animação interrompida */ }
    animando = false;
  }
  function animarEntrada() {
    const p = raiz && raiz.querySelector('.painel');
    if (!p || !p.animate || semMovimento()) return;
    const r = p.getBoundingClientRect();
    p.style.transformOrigin = `${innerWidth - 77 - r.left}px ${innerHeight - 44 - r.top}px`;
    p.animate([{ transform: 'scale(.92)', opacity: 0, filter: 'blur(4px)' }, { transform: 'scale(1)', opacity: 1, filter: 'blur(0px)' }],
      { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  // Estouro bem leve de gotinhas azuis em volta do botão
  function estourar() {
    const b = raiz && raiz.querySelector('.lancador');
    if (!b || !b.animate || semMovimento()) return;
    const r = b.getBoundingClientRect();
    b.animate([{ transform: 'scale(.8)', opacity: .4 }, { transform: 'scale(1.04)', opacity: 1, offset: .6 }, { transform: 'scale(1)', opacity: 1 }],
      { duration: 380, easing: 'ease-out' });
    const g = document.createElement('div');
    g.className = 'gotas';
    g.style.left = (r.left + r.width / 2) + 'px'; g.style.top = (r.top + r.height / 2) + 'px';
    const cores = ['#2f6fed', '#5b93f7', '#8cb4ff', '#38bdf8'];
    const n = 12;
    for (let i = 0; i < n; i++) {
      const sp = document.createElement('span');
      const t = 2 + Math.random() * 2.5;
      sp.style.width = sp.style.height = t + 'px';
      sp.style.marginLeft = sp.style.marginTop = (-t / 2) + 'px';
      sp.style.setProperty('--c', cores[i % cores.length]);
      g.appendChild(sp);
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      // nasce na borda do botão e se afasta um pouquinho
      const rx = r.width / 2 + 2, ry = r.height / 2 + 2, d = 12 + Math.random() * 16;
      const x0 = Math.cos(ang) * rx, y0 = Math.sin(ang) * ry;
      const x1 = Math.cos(ang) * (rx + d), y1 = Math.sin(ang) * (ry + d);
      sp.animate([
        { transform: `translate(${x0}px, ${y0}px) scale(1)`, opacity: 0 },
        { transform: `translate(${(x0 + x1) / 2}px, ${(y0 + y1) / 2}px) scale(1)`, opacity: .9, offset: .25 },
        { transform: `translate(${x1}px, ${y1}px) scale(.2)`, opacity: 0 }
      ], { duration: 520 + Math.random() * 220, delay: Math.random() * 60, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
    }
    raiz.appendChild(g);
    setTimeout(() => g.remove(), 900);
  }
  async function fecharComAnimacao() {
    await animarSaida();
    s.aberto = false;
    renderPendente = false;
    render();
    estourar();
  }

  /* ---------- Lolla em guia própria (guia.html conectada a esta aba) ---------- */
  const portas = new Set();
  function estadoParaGuia() {
    return { leitura: s.leitura, pareamento: s.pareamento, ind: s.ind, conferencia: s.conferencia, analise: s.analise, analisando: s.analisando,
      erroIA: s.erroIA, chat: s.chat, conversando: s.conversando, status: s.status, atualizadoEm: s.atualizadoEm, aviso: s.aviso, tema: s.tema };
  }
  function enviarEstado() {
    portas.forEach((p) => { try { p.postMessage({ tipo: 'estado', s: estadoParaGuia() }); } catch (e) { portas.delete(p); } });
  }
  chrome.runtime.onConnect.addListener((porta) => {
    if (porta.name !== 'lolla-guia') return;
    if (!tela.encontrar().ok) { porta.disconnect(); return; } // só o quadro com a Conciliação atende
    portas.add(porta);
    porta.onDisconnect.addListener(() => portas.delete(porta));
    porta.onMessage.addListener(async (m) => {
      if (m.a === 'copiar') { porta.postMessage({ tipo: 'texto', texto: s.analise ? resumo() : '' }); return; }
      if (m.a === 'perguntar') { perguntar(m.texto || ''); return; }
      await executar(m.a, { refs: m.refs || [], k: m.k, d: m.d });
    });
    if (!s.status) enviar({ tipo: 'status' }).then((st) => { s.status = st; enviarEstado(); });
    reler(true);
    enviarEstado();
  });

  function avisar(tipo, texto) {
    s.aviso = { tipo, texto }; render();
    setTimeout(() => { s.aviso = null; render(); }, 3500);
  }

  /* ---------- Leitura automática ---------- */
  function reler(forcar) {
    const l = tela.ler();
    if (!forcar && l.assinatura === s.assinatura) return;
    const mudou = s.assinatura && l.assinatura !== s.assinatura;
    s.leitura = l;
    s.pareamento = Lolla.domain.pareamento.parear(l.movimentacao, l.extrato);
    s.ind = Lolla.domain.indicadores.daConciliacao({ movimentacao: l.movimentacao, extrato: l.extrato, pareamento: s.pareamento });
    s.conferencia = tela.conferir(l);
    s.assinatura = l.assinatura;
    s.atualizadoEm = Date.now();
    if (mudou && s.analise) s.analise.desatualizada = true;
    render();
  }

  // Acompanha o tema do IXC (claro/escuro) no painel e no visual modernizado
  function atualizarTema() {
    const t = Lolla.visual.detectarTema();
    if (s.visualModerno) Lolla.visual.marcarTema(t);
    if (t === s.tema) return;
    s.tema = t;
    if (host) host.setAttribute('data-tema', t);
    enviarEstado();
  }

  function verificar() {
    if (!s.ativo) return;
    const tem = tela.encontrar().ok;
    if (tem) atualizarTema();
    if (tem && s.visualModerno) Lolla.visual.aplicar(); else Lolla.visual.remover();
    if (tem && !host) { montar(); reler(true); }
    else if (!tem && host) { desmontar(); s.aberto = false; s.assinatura = ''; }
    else if (tem) reler(false);
    if (tem && s.visualModerno) Lolla.visual.atualizarSelecao(tela.ler().rodape);
  }

  function ligar() {
    s.ativo = true;
    observador = new MutationObserver(() => { clearTimeout(espera); espera = setTimeout(verificar, 300); });
    observador.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    relogio = setInterval(() => { if (host) { atualizarTema(); reler(false); if (s.visualModerno) Lolla.visual.atualizarSelecao(tela.ler().rodape); } }, 2000);
    document.addEventListener('change', aoMarcar, true);
    verificar();
  }
  // Ao marcar/desmarcar uma linha no IXC, recolore a seleção (verde/laranja) logo depois do IXC somar
  function aoMarcar(ev) {
    if (!s.visualModerno || !ev.target.matches || !ev.target.matches('input[type="checkbox"]')) return;
    setTimeout(() => Lolla.visual.atualizarSelecao(tela.ler().rodape), 150);
  }
  function desligar() {
    s.ativo = false;
    if (observador) observador.disconnect();
    clearInterval(relogio); clearTimeout(espera);
    document.removeEventListener('change', aoMarcar, true);
    Lolla.visual.remover();
    document.documentElement.removeAttribute('data-lolla-tema');
    desmontar(); s.aberto = false;
  }

  /* ---------- IA ---------- */
  const enviar = (msg) => new Promise((ok) => chrome.runtime.sendMessage(msg, (r) => ok(r || { ok: false, erro: (chrome.runtime.lastError || {}).message || 'Sem resposta da extensão.' })));

  function payload() {
    const datas = s.leitura.movimentacao.concat(s.leitura.extrato).map((l) => l.data).filter(Boolean).sort();
    return Lolla.domain.mascaramento.montarPayload({
      conta: { banco: '' }, filtros: { dataIni: datas[0] || '', dataFim: datas[datas.length - 1] || '' },
      pareamento: s.pareamento, indicadores: s.ind
    });
  }

  async function analisar() {
    s.analisando = true; s.erroIA = null; s.chat = []; render();
    try {
      s.status = await enviar({ tipo: 'status' });
      const p = payload();
      let r;
      if (s.status.iaSimulada) {
        // A IA simulada não usa o texto, mas lista os contextos que seriam enviados (para testar sem gastar tokens)
        const ctx = await enviar({ tipo: 'contextos' });
        r = Object.assign({}, await Lolla.services.iaSimulada.analisar(p), { contextos: ctx.contextos || [], avisoContexto: ctx.ok ? ctx.aviso : ctx.erro });
      } else {
        r = await enviar({ tipo: 'analisar', payload: p });
        if (!r.ok) throw new Error(r.erro);
      }
      s.analise = { id: 'A' + Date.now(), em: Date.now(), resultado: r.resultado, usage: r.usage || null, decisoes: {}, desatualizada: false,
        contextos: r.contextos || [], avisoContexto: r.avisoContexto || null,
        diferenca: p.totais_calculados_pelo_codigo.diferenca_ixc_menos_banco, simulado: !!s.status.iaSimulada };
      guardarHistorico();
    } catch (e) { s.erroIA = e.message; }
    s.analisando = false; render();
  }

  async function guardarHistorico() {
    try {
      const { historico = [] } = await chrome.storage.local.get('historico');
      const i = historico.findIndex((h) => h.id === s.analise.id);
      const reg = { id: s.analise.id, em: s.analise.em, diferenca: s.analise.diferenca, simulado: s.analise.simulado,
        itens: s.analise.resultado.itens.map((it) => it.categoria), decisoes: s.analise.decisoes, usage: s.analise.usage };
      if (i >= 0) historico[i] = reg; else historico.push(reg);
      await chrome.storage.local.set({ historico: historico.slice(-100) });
    } catch (e) { /* histórico é opcional */ }
  }

  async function perguntar(texto) {
    if (!texto.trim() || !s.analise) return;
    s.chat.push({ papel: 'usuario', texto }); s.conversando = true; render();
    if (s.status && s.status.iaSimulada) {
      s.chat.push({ papel: 'lolla', texto: '[IA simulada] Configure a chave da API nas Configurações da extensão para conversar com a Lolla.' });
    } else {
      const r = await enviar({ tipo: 'conversar', historico: s.chat, payload: payload(), resultado: s.analise.resultado });
      s.chat.push(r.ok ? { papel: 'lolla', texto: r.texto } : { papel: 'erro', texto: r.erro });
    }
    s.conversando = false; render();
  }

  function resumo() {
    const a = s.analise, r = a.resultado;
    const linhas = ['Análise de conciliação (AR Lolla)', `Diferença (IXC − banco): ${fmt.reais(Math.round(a.diferenca * 100))}`, '', r.resumo || '', ''];
    r.itens.forEach((it, k) => linhas.push(`${k + 1}. ${it.categoria} (${(it.refs || []).join(', ')}) — ${it.causa} Próximo passo: ${it.proximo_passo}${a.decisoes[k] ? ` [${a.decisoes[k]}]` : ''}`));
    if (r.perguntas_ao_cliente.length) linhas.push('', 'Perguntas ao cliente:', ...r.perguntas_ao_cliente.map((p) => '- ' + p));
    return linhas.join('\n');
  }

  /* ---------- Eventos do painel ---------- */
  async function aoClicar(ev) {
    const b = ev.target.closest('[data-a]');
    if (!b || b.disabled) return;
    const refs = (b.dataset.refs || '').split(',').filter(Boolean);
    return executar(b.dataset.a, { refs, k: b.dataset.k, d: b.dataset.d });
  }

  // Ações usadas pelo painel flutuante e pela guia
  async function executar(acao, { refs = [], k, d } = {}) {
    switch (acao) {
      case 'expandir': {
        // Abre/fecha o painel largo com transição de largura, para ficar claro o que mudou
        const p0 = raiz.querySelector('.painel');
        const w0 = p0 ? p0.getBoundingClientRect().width : 0;
        s.expandido = !s.expandido; render();
        const p1 = raiz.querySelector('.painel');
        if (p1 && p1.animate && w0 && !semMovimento()) {
          const w1 = p1.getBoundingClientRect().width;
          p1.animate([{ width: w0 + 'px' }, { width: w1 + 'px' }], { duration: 340, easing: 'cubic-bezier(.2,.8,.2,1)' });
          const c = p1.querySelector('.corpo');
          if (c) c.animate([{ opacity: .25, filter: 'blur(3px)' }, { opacity: 1, filter: 'blur(0px)' }], { duration: 340, easing: 'ease-out' });
        }
        avisar('ok', s.expandido ? 'Painel expandido: blocos lado a lado.' : 'Painel recolhido.');
        return;
      }
      case 'abrir-guia': {
        const r = await enviar({ tipo: 'abrir-guia' });
        if (!r.ok) avisar('erro', r.erro || 'Não foi possível abrir a guia.');
        else await fecharComAnimacao();
        return;
      }
      case 'abrir': s.aberto = true; render(); animarEntrada(); s.status = await enviar({ tipo: 'status' }); reler(true); return;
      case 'minimizar': if (s.aberto && !animando) await fecharComAnimacao(); return;
      case 'mostrar': { const n = tela.destacar(refs); if (!n) avisar('erro', 'Linha não está visível na grade agora.'); return; }
      case 'selecionar': { const n = tela.selecionar(refs); avisar(n ? 'ok' : 'erro', n ? `${n} linha(s) marcada(s) no IXC. Confira e concilie pelo IXC.` : 'Nada para marcar (já marcadas ou fora da grade).'); return; }
      case 'analisar': return analisar();
      case 'decidir': s.analise.decisoes[k] = d || undefined; guardarHistorico(); render(); return;
      case 'copiar': {
        const txt = resumo();
        try { await navigator.clipboard.writeText(txt); avisar('ok', 'Resumo copiado.'); }
        catch (e) { const t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); avisar('ok', 'Resumo copiado.'); }
      }
    }
  }
  function aoEnviar(ev) {
    ev.preventDefault();
    const inp = raiz.getElementById('lolla-chat');
    const txt = inp.value; inp.value = '';
    perguntar(txt);
  }

  /* ---------- Liga/desliga e mensagens do botão da extensão ---------- */
  chrome.storage.local.get({ ativo: true, visualModerno: true }, (c) => { s.visualModerno = c.visualModerno; if (c.ativo) ligar(); });
  chrome.storage.onChanged.addListener((m, area) => {
    if (area !== 'local') return;
    if (m.visualModerno) { s.visualModerno = m.visualModerno.newValue; if (s.ativo) verificar(); }
    if (!m.ativo) return;
    if (m.ativo.newValue && !s.ativo) ligar();
    if (!m.ativo.newValue && s.ativo) desligar();
  });
  chrome.runtime.onMessage.addListener((msg, _r, responder) => {
    if (!msg || !tela.encontrar().ok) return false; // só o frame com a Conciliação responde
    if (msg.tipo === 'abrir-painel') {
      if (!s.ativo) ligar();
      if (!host) montar();
      s.aberto = true;
      enviar({ tipo: 'status' }).then((st) => { s.status = st; reler(true); });
      responder({ ok: true });
    }
    if (msg.tipo === 'na-conciliacao') responder({ ok: true });
    return false;
  });
})();

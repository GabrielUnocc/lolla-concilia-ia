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
    ativo: false, aberto: false, leitura: null, pareamento: null, ind: null, conferencia: null, assinatura: '',
    analise: null, analisando: false, erroIA: null, chat: [], conversando: false, status: null, atualizadoEm: null, aviso: null
  };
  let host = null, raiz = null, observador = null, relogio = null, espera = null;

  /* ---------- Montagem do painel ---------- */
  function montar() {
    host = document.createElement('div');
    host.id = 'lolla-host';
    raiz = host.attachShadow({ mode: 'open' });
    raiz.innerHTML = `<style>${Lolla.painel.CSS}</style><div id="r"></div>`;
    document.documentElement.appendChild(host);
    raiz.addEventListener('click', aoClicar);
    raiz.addEventListener('submit', aoEnviar);
  }
  function desmontar() { if (host) host.remove(); host = raiz = null; }

  function render() {
    if (!raiz) return;
    const entrada = raiz.getElementById('lolla-chat');
    const rascunho = entrada ? entrada.value : '';
    const focado = raiz.activeElement && raiz.activeElement.id === 'lolla-chat';
    const corpo = raiz.querySelector('.corpo');
    const rolagem = corpo ? corpo.scrollTop : 0;
    raiz.getElementById('r').innerHTML = s.aberto ? Lolla.painel.painel(s) : Lolla.painel.lancador(s);
    const nova = raiz.getElementById('lolla-chat');
    if (nova) { nova.value = rascunho; if (focado) nova.focus(); }
    const c2 = raiz.querySelector('.corpo'); if (c2) c2.scrollTop = rolagem;
    const msgs = raiz.querySelector('.msgs'); if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }

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

  function verificar() {
    if (!s.ativo) return;
    const tem = tela.encontrar().ok;
    if (tem && !host) { montar(); reler(true); }
    else if (!tem && host) { desmontar(); s.aberto = false; s.assinatura = ''; }
    else if (tem) reler(false);
  }

  function ligar() {
    s.ativo = true;
    observador = new MutationObserver(() => { clearTimeout(espera); espera = setTimeout(verificar, 300); });
    observador.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    relogio = setInterval(() => { if (host) reler(false); }, 2000); // pega mudanças nos totais (input.value)
    verificar();
  }
  function desligar() {
    s.ativo = false;
    if (observador) observador.disconnect();
    clearInterval(relogio); clearTimeout(espera);
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
      if (s.status.iaSimulada) r = await Lolla.services.iaSimulada.analisar(p);
      else {
        r = await enviar({ tipo: 'analisar', payload: p });
        if (!r.ok) throw new Error(r.erro);
      }
      s.analise = { id: 'A' + Date.now(), em: Date.now(), resultado: r.resultado, usage: r.usage || null, decisoes: {}, desatualizada: false,
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
    switch (b.dataset.a) {
      case 'abrir': s.aberto = true; s.status = await enviar({ tipo: 'status' }); reler(true); return;
      case 'minimizar': s.aberto = false; render(); return;
      case 'mostrar': { const n = tela.destacar(refs); if (!n) avisar('erro', 'Linha não está visível na grade agora.'); return; }
      case 'selecionar': { const n = tela.selecionar(refs); avisar(n ? 'ok' : 'erro', n ? `${n} linha(s) marcada(s) no IXC. Confira e concilie pelo IXC.` : 'Nada para marcar (já marcadas ou fora da grade).'); return; }
      case 'analisar': return analisar();
      case 'decidir': s.analise.decisoes[b.dataset.k] = b.dataset.d || undefined; guardarHistorico(); render(); return;
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
  chrome.storage.local.get({ ativo: true }, (c) => { if (c.ativo) ligar(); });
  chrome.storage.onChanged.addListener((m, area) => {
    if (area !== 'local' || !m.ativo) return;
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

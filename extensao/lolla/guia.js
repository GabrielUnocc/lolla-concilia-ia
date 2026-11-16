/*
 * A Lolla numa guia própria.
 * Não lê o IXC diretamente: conecta-se à aba do IXC que a abriu e mostra o que o painel de lá lê,
 * em tempo real. As ações (analisar, mostrar, selecionar...) são executadas na aba do IXC.
 */
(function () {
  const params = new URLSearchParams(location.search);
  const abaIxc = Number(params.get('aba'));
  const quadro = Number(params.get('quadro') || 0);

  const host = document.getElementById('host');
  const raiz = host.attachShadow({ mode: 'open' });
  raiz.innerHTML = `<style>${Lolla.painel.CSS}</style><div id="r"></div>`;
  const alvo = raiz.getElementById('r');

  let porta = null, estado = null, aviso = null, tentativa = null;

  function render() {
    const entrada = raiz.getElementById('lolla-chat');
    const rascunho = entrada ? entrada.value : '';
    const focado = raiz.activeElement && raiz.activeElement.id === 'lolla-chat';
    const corpo = raiz.querySelector('.corpo');
    const rolagem = corpo ? corpo.scrollTop : 0;
    if (!estado) {
      alvo.innerHTML = `<div class="painel base guia"><div class="cab"><div><b>AR Lolla</b><small>Conciliação com IA</small></div></div>
        <div class="corpo"><div class="bloco desconectado"><p>${porta ? 'Conectando à Conciliação do IXC…' :
          'A conexão com a aba do IXC caiu (a aba foi fechada, recarregada ou saiu da Conciliação Manual).'}</p>
          <p class="suave">Volte à Conciliação Manual no IXC e clique em <b>Abrir em guia</b> de novo, ou aguarde: esta guia tenta reconectar sozinha.</p></div></div></div>`;
      return;
    }
    alvo.innerHTML = Lolla.painel.painel(Object.assign({}, estado, { aviso: aviso || estado.aviso }), { modo: 'guia' });
    const nova = raiz.getElementById('lolla-chat');
    if (nova) { nova.value = rascunho; if (focado) nova.focus(); }
    const c2 = raiz.querySelector('.corpo'); if (c2) c2.scrollTop = rolagem;
    const msgs = raiz.querySelector('.msgs'); if (msgs) msgs.scrollTop = msgs.scrollHeight;
    if (estado.analise) document.title = 'AR Lolla — ' + (estado.ind ? `${estado.ind.sobrasIxc + estado.ind.sobrasBanco} sobra(s)` : 'Conciliação');
  }

  function avisar(tipo, texto) { aviso = { tipo, texto }; render(); setTimeout(() => { aviso = null; render(); }, 3000); }

  function conectar() {
    clearTimeout(tentativa);
    if (!abaIxc) { estado = null; render(); return; }
    try { porta = chrome.tabs.connect(abaIxc, { name: 'lolla-guia', frameId: quadro }); }
    catch (e) { porta = null; estado = null; render(); tentativa = setTimeout(conectar, 3000); return; }
    porta.onMessage.addListener(async (m) => {
      if (m.tipo === 'estado') { estado = m.s; render(); }
      if (m.tipo === 'texto') {
        if (!m.texto) return;
        try { await navigator.clipboard.writeText(m.texto); avisar('ok', 'Resumo copiado.'); }
        catch (e) { avisar('erro', 'Não consegui copiar. Tente de novo.'); }
      }
    });
    porta.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      porta = null; estado = null; render();
      tentativa = setTimeout(conectar, 3000);
    });
    render();
  }

  const irParaIxc = () => chrome.tabs.update(abaIxc, { active: true }).catch(() => avisar('erro', 'A aba do IXC não está mais aberta.'));

  raiz.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-a]');
    if (!b || b.disabled || !porta) return;
    const a = b.dataset.a;
    const refs = (b.dataset.refs || '').split(',').filter(Boolean);
    if (a === 'ir-ixc') return irParaIxc();
    porta.postMessage({ a, refs, k: b.dataset.k, d: b.dataset.d });
    if (a === 'mostrar' || a === 'selecionar') irParaIxc(); // leva você até a linha destacada no IXC
  });
  raiz.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const inp = raiz.getElementById('lolla-chat');
    if (!porta || !inp) return;
    porta.postMessage({ a: 'perguntar', texto: inp.value });
    inp.value = '';
  });

  conectar();
})();

/*
 * Inicialização, tela de desbloqueio, abas e eventos (delegação por data-acao).
 */
(function () {
  const store = Lolla.core.store;
  const acoes = Lolla.acoes;
  const cofre = Lolla.services.armazenamento.cofre;
  const prefs = Lolla.services.armazenamento.publico;
  const views = Lolla.ui.views;
  const { esc } = Lolla.core.fmt;
  const $ = (sel) => document.querySelector(sel);

  const ABAS = [['conciliacao', 'Conciliação'], ['indicadores', 'Indicadores'], ['historico', 'Histórico'], ['configuracoes', 'Configurações']];

  /* ---------- Diálogo de confirmação na própria página (confirm/prompt nativos não funcionam em todo lugar) ---------- */
  function dialogo({ texto, confirmar = 'Confirmar', perigo = false, conteudo = '' }) {
    return new Promise((resolver) => {
      const fundo = document.createElement('div');
      fundo.className = 'dialogo-fundo';
      fundo.innerHTML = `<div class="dialogo" role="dialog" aria-modal="true"><p>${esc(texto)}</p>${conteudo}
        <div class="dialogo-botoes">${confirmar ? '<button data-r="nao">Cancelar</button>' : ''}
        <button data-r="sim" class="${perigo ? 'perigo' : 'primario'}">${esc(confirmar || 'Fechar')}</button></div></div>`;
      const fechar = (v) => { fundo.remove(); resolver(v); };
      fundo.addEventListener('click', (e) => {
        if (e.target === fundo) return fechar(false);
        const b = e.target.closest('[data-r]'); if (b) fechar(b.dataset.r === 'sim' && !!confirmar);
      });
      document.body.appendChild(fundo);
      const ta = fundo.querySelector('textarea'); if (ta) ta.select(); else fundo.querySelector('[data-r="sim"]').focus();
    });
  }
  const confirmar = (texto, opcoes) => dialogo(Object.assign({ texto }, opcoes));

  /* ---------- Desbloqueio ---------- */
  function telaCofre(erro) {
    const novo = !cofre.existe();
    $('#app').innerHTML = `<div class="cofre"><form data-form="cofre">
      <h2>${novo ? 'Criar senha local' : 'Desbloquear a Lolla'}</h2>
      <p>${novo ? 'Os dados desta aplicação (base simulada e histórico) ficam cifrados neste navegador com esta senha. Ela não sai do computador.'
                : 'Digite a senha local para abrir os dados cifrados.'}</p>
      <input id="senha" type="password" autocomplete="current-password" placeholder="Senha local" minlength="${novo ? 6 : 1}" required autofocus>
      ${novo ? '<input id="senha2" type="password" placeholder="Repita a senha" required>' : ''}
      ${erro ? `<div class="alerta erro">${esc(erro)}</div>` : ''}
      <button class="primario">${novo ? 'Criar e entrar' : 'Entrar'}</button>
      ${novo ? '' : '<p><button type="button" data-acao="apagar-tudo" class="link">Esqueci a senha (apagar dados locais)</button></p>'}
    </form></div>`;
    const s = $('#senha'); if (s) s.focus();
  }

  async function entrar(form) {
    const senha = form.querySelector('#senha').value;
    const botao = form.querySelector('button.primario');
    botao.disabled = true; botao.textContent = 'Abrindo…';
    try {
      if (!cofre.existe()) {
        if (senha.length < 6) throw new Error('Use pelo menos 6 caracteres.');
        if (senha !== form.querySelector('#senha2').value) throw new Error('As senhas não conferem.');
        await cofre.criar(senha);
      } else {
        await cofre.abrir(senha);
      }
      store.set({ desbloqueado: true });
      render();
      acoes.carregarContas().then(() => { if (store.get().contas.length) acoes.buscar(); });
    } catch (e) {
      telaCofre(e.message);
    }
  }

  /* ---------- Renderização (preserva foco e texto digitado) ---------- */
  function render() {
    const s = store.get();
    if (!s.desbloqueado) return;
    const ativo = document.activeElement;
    const foco = ativo && ativo.id ? { id: ativo.id, valor: ativo.value, ini: ativo.selectionStart, fim: ativo.selectionEnd } : null;
    const rascunho = $('#chat-entrada') ? $('#chat-entrada').value : '';

    const st = Lolla.services.claude.status();
    const faixa = !st.simulada && Lolla.core.config.get().claude.autenticacao === 'navegador-direto'
      ? '<div class="faixa-aviso">Chave da API no navegador: uso local apenas. Não publique esta aplicação.</div>' : '';
    const corpo = views[s.aba].render(s);
    $('#app').innerHTML = `${faixa}
      <header class="topo"><div class="marca"><b>AR Lolla</b><span>Conciliação bancária com IA · MVP local</span></div>
        <nav>${ABAS.map(([id, nome]) => `<button data-acao="aba" data-aba="${id}" class="${s.aba === id ? 'ativa' : ''}">${nome}</button>`).join('')}</nav></header>
      <main class="conteudo">${corpo}</main>
      ${s.aviso ? `<div class="toast ${s.aviso.tipo}">${esc(s.aviso.texto)}</div>` : ''}`;

    const chat = $('#chat-entrada');
    if (chat && rascunho) chat.value = rascunho;
    if (foco) {
      const el = document.getElementById(foco.id);
      if (el) {
        if (el.id === 'chat-entrada' && foco.valor != null) el.value = foco.valor;
        el.focus();
        try { if (foco.ini != null) el.setSelectionRange(foco.ini, foco.fim); } catch (e) { /* inputs sem seleção */ }
      }
    }
    const msgs = document.querySelector('.chat .msgs'); if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }

  async function abrirAba(aba) {
    store.set({ aba });
    if (aba === 'indicadores' || aba === 'historico') store.set({ historico: await acoes.lerHistorico() });
  }

  /* ---------- Eventos ---------- */
  document.addEventListener('click', async (ev) => {
    const alvo = ev.target.closest('[data-acao]');
    if (!alvo || alvo.disabled) return;
    const a = alvo.dataset.acao;
    const s = store.get();
    switch (a) {
      case 'aba': return abrirAba(alvo.dataset.aba);
      case 'selecionar': return acoes.alternarSelecao(alvo.dataset.lado, alvo.dataset.id);
      case 'repetir': return s.erro && s.erro.repetir === 'carregarContas' ? acoes.carregarContas().then(acoes.buscar) : acoes.buscar();
      case 'conciliar': return acoes.conciliarSelecao();
      case 'desconciliar': return acoes.desconciliarSelecao();
      case 'limpar-selecao': return acoes.limparSelecao();
      case 'lancar': return acoes.lancarNoIxc(s.selecao.ext[0]);
      case 'estornar':
        if (await confirmar('Estornar esta baixa no IXC (simulado)?', { confirmar: 'Estornar', perigo: true })) return acoes.estornarBaixa(s.selecao.mov[0]);
        return;
      case 'conciliar-pares':
        if (await confirmar('Conciliar todos os pares automáticos (exceto os ambíguos)?', { confirmar: 'Conciliar' })) return acoes.conciliarParesAutomaticos();
        return;
      case 'analisar': return acoes.analisar();
      case 'ver-refs': {
        acoes.selecionarRefs(alvo.dataset.refs.split(',').filter(Boolean));
        const el = document.querySelector('tr.destaque'); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      case 'lancar-ref': return acoes.lancarNoIxc(alvo.dataset.id);
      case 'estornar-ref':
        if (await confirmar('Estornar esta baixa no IXC (simulado)?', { confirmar: 'Estornar', perigo: true })) return acoes.estornarBaixa(alvo.dataset.id);
        return;
      case 'decidir': return acoes.decidir(Number(alvo.dataset.k), alvo.dataset.d || undefined);
      case 'copiar-resumo': {
        const txt = acoes.resumoParaAtendimento();
        try { await navigator.clipboard.writeText(txt); acoes.avisar('ok', 'Resumo copiado.'); }
        catch (e) { dialogo({ texto: 'Copie o resumo:', confirmar: '', conteudo: `<textarea rows="10" readonly>${esc(txt)}</textarea>` }); }
        return;
      }
      case 'testar-claude':
        store.set({ testeClaude: 'Testando…' });
        try { const r = await Lolla.services.claude.testarConexao(); store.set({ testeClaude: 'Conectado: ' + r.modelo }); }
        catch (e) { store.set({ testeClaude: e.message }); }
        return;
      case 'restaurar-base':
        if (!(await confirmar('Restaurar a base simulada? Conciliações e lançamentos de teste serão desfeitos.', { confirmar: 'Restaurar' }))) return;
        await Lolla.services.ixc.restaurarBase();
        acoes.avisar('ok', 'Base simulada restaurada.');
        return acoes.buscar();
      case 'bloquear':
        cofre.bloquear(); location.reload(); return;
      case 'apagar-tudo':
        if (!(await confirmar('Apagar base simulada, histórico e senha local deste navegador? Não dá para desfazer.', { confirmar: 'Apagar tudo', perigo: true }))) return;
        cofre.apagarTudo(); location.reload(); return;
    }
  });

  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.dataset.acao === 'forcar-simulada') { prefs.gravar('forcar_ia_simulada', el.checked); render(); }
    if (el.dataset.acao === 'taxa-erro') { Lolla.core.config.ajustarIxc({ taxaErro: Number(el.value) / 100 }); render(); }
    if (el.dataset.acao === 'latencia') { Lolla.core.config.ajustarIxc({ latenciaMaxMs: Number(el.value), latenciaMinMs: Math.min(300, Number(el.value)) }); render(); }
    if (el.closest('[data-form="filtros"]')) acoes.filtrar({ [el.name]: el.value });
  });

  document.addEventListener('submit', (ev) => {
    const form = ev.target.closest('[data-form]');
    if (!form) return;
    ev.preventDefault();
    if (form.dataset.form === 'cofre') return entrar(form);
    if (form.dataset.form === 'filtros') return acoes.buscar();
    if (form.dataset.form === 'chat') {
      const inp = form.querySelector('#chat-entrada');
      const txt = inp.value; inp.value = '';
      return acoes.perguntar(txt);
    }
  });

  store.assinar(render);

  /* ---------- Início ---------- */
  if (!Lolla.services.cripto.disponivel()) {
    $('#app').innerHTML = '<div class="cofre"><div class="alerta erro">Este navegador não oferece criptografia (Web Crypto). Use Chrome ou Edge atualizados.</div></div>';
  } else {
    telaCofre();
  }
})();

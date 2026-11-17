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

  const ABAS = [['painel', 'Painel'], ['conciliacao', 'Conciliação'], ['indicadores', 'Indicadores'], ['historico', 'Histórico'], ['contexto', 'Contexto da IA'], ['configuracoes', 'Configurações']];
  const ctxSrv = Lolla.services.contexto;
  const vCtx = () => Lolla.ui.views.contexto;
  const setCtx = (parcial) => store.set((s) => ({ ctx: Object.assign({}, s.ctx, parcial) }));

  /* ---------- Contexto da IA ---------- */
  async function carregarContextos() {
    if (!ctxSrv.disponivel()) return;
    setCtx({ erro: null });
    try {
      const r = await ctxSrv.listar();
      const x = store.get().ctx;
      const aberto = r.contextos.some((i) => i.id === x.aberto) ? x.aberto : (r.contextos[0] || {}).id || null;
      setCtx({ lista: r.contextos, limites: r.limites, total: r.total_caracteres, aberto });
    } catch (e) { setCtx({ erro: e.message }); }
  }
  async function salvarContexto() {
    const x = store.get().ctx, rc = vCtx().rascunho;
    const titulo = rc.titulo.trim(), texto = rc.texto.trim();
    if (!titulo || !texto) return setCtx({ erroForm: !titulo ? 'Informe o título.' : 'Escreva o texto do contexto.' });
    setCtx({ salvando: true, erroForm: null });
    try {
      const novo = x.modo === 'novo';
      const r = novo ? await ctxSrv.criar({ titulo, texto }) : await ctxSrv.atualizar(x.aberto, { titulo, texto });
      setCtx({ salvando: false, modo: 'ver', aberto: r.id });
      await carregarContextos();
      acoes.avisar('ok', novo ? 'Contexto salvo. A próxima análise já usa ele.' : 'Contexto atualizado. A próxima análise já usa o texto novo.');
    } catch (e) { setCtx({ salvando: false, erroForm: e.message }); }
  }

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

  /* ---------- Importação de OFX ---------- */
  function abrirImportacaoOfx() {
    const { reais, brDeIso } = Lolla.core.fmt;
    const fundo = document.createElement('div');
    fundo.className = 'dialogo-fundo';
    fundo.innerHTML = `<form class="dialogo largo" data-form="ofx" role="dialog" aria-modal="true" aria-labelledby="ofx-titulo">
      <h3 id="ofx-titulo">Importar extrato OFX</h3>
      <p class="nota">O arquivo é lido aqui no navegador e não é enviado para lugar nenhum. Para a IA vão só valor, data, documento e histórico mascarado.</p>
      <label class="arquivo">Arquivo OFX<input id="ofx-arquivo" type="file" accept=".ofx,.OFX,application/x-ofx" required></label>
      <div id="ofx-resumo"></div>
      <fieldset><legend>Lado do IXC (simulado)</legend>
        <label class="opcao"><input type="radio" name="modo" value="divergencias" checked><span><b>Espelho com divergências</b><small>Copia o OFX para o IXC e planta alguns erros (sem baixa, duplicada, data, valor, despesa, recebimento manual). Ao final mostra o gabarito.</small></span></label>
        <label class="opcao"><input type="radio" name="modo" value="exato"><span><b>Espelho exato</b><small>Cópia fiel: o código deve parear tudo sozinho.</small></span></label>
        <label class="opcao"><input type="radio" name="modo" value="vazio"><span><b>IXC vazio</b><small>Só o extrato real, para conferir a leitura e a validação do arquivo.</small></span></label>
      </fieldset>
      <div class="dialogo-botoes"><button type="button" data-r="cancelar">Cancelar</button><button class="primario" id="ofx-importar" disabled>Importar</button></div>
    </form>`;
    document.body.appendChild(fundo);
    let lido = null;
    const resumo = fundo.querySelector('#ofx-resumo');
    const botao = fundo.querySelector('#ofx-importar');
    const fechar = () => fundo.remove();
    fundo.addEventListener('click', (e) => { if (e.target === fundo || e.target.closest('[data-r="cancelar"]')) fechar(); });

    fundo.querySelector('#ofx-arquivo').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      lido = null; botao.disabled = true;
      if (!f) { resumo.innerHTML = ''; return; }
      resumo.innerHTML = Lolla.ui.c.spinner('Lendo o arquivo…');
      try {
        if (f.size > 5 * 1024 * 1024) throw new Error('Arquivo maior que 5 MB. Exporte um período menor.');
        const ofx = Lolla.domain.ofx.interpretar(await Lolla.domain.ofx.lerArquivo(f), f.name);
        const a = ofx.alertas, r = ofx.resumo;
        const alertas = [
          a.linhaRepetida.length && `${a.linhaRepetida.length} lançamento(s) repetido(s) no arquivo (linhas ${a.linhaRepetida.map((x) => x.join(' e ')).join('; ')})`,
          a.fitidRepetido.length && `${a.fitidRepetido.length} identificador(es) FITID repetido(s)`,
          a.invalidas.length && `${a.invalidas.length} linha(s) ignorada(s) por falta de data ou valor`,
          a.fora.length && `${a.fora.length} lançamento(s) fora do período informado no arquivo`,
          a.semFitid && `${a.semFitid} lançamento(s) sem FITID`
        ].filter(Boolean);
        resumo.innerHTML = `<table class="simples"><tbody>
          <tr><td>Banco / conta</td><td>${esc(ofx.conta.banco)} · ag. ${esc(ofx.conta.agencia || '—')} · conta ${esc(ofx.conta.numero || '—')}</td></tr>
          <tr><td>Período</td><td>${brDeIso(ofx.periodo.inicio)} a ${brDeIso(ofx.periodo.fim)}</td></tr>
          <tr><td>Lançamentos</td><td>${r.total} (${r.qtdCreditos} créditos · ${r.qtdDebitos} débitos)</td></tr>
          <tr><td>Créditos / débitos</td><td>${reais(r.creditos)} / ${reais(r.debitos)}</td></tr>
          ${ofx.saldoFinal != null ? `<tr><td>Saldo final no arquivo</td><td>${reais(ofx.saldoFinal)}</td></tr>` : ''}
        </tbody></table>
        ${alertas.length ? `<div class="alerta aviso"><b>Atenção no arquivo:</b><ul>${alertas.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : '<p class="ok-txt">Nenhum problema encontrado no arquivo.</p>'}`;
        lido = ofx; botao.disabled = false;
      } catch (err) {
        resumo.innerHTML = `<div class="alerta erro">${esc(err.message)}</div>`;
      }
    });

    fundo.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!lido) return;
      const modo = fundo.querySelector('input[name="modo"]:checked').value;
      botao.disabled = true; botao.textContent = 'Importando…';
      try {
        const r = await acoes.importarOfx(lido, modo);
        fechar();
        if (r.gabarito.length) {
          dialogo({ texto: 'OFX importado. Gabarito do que foi plantado no IXC, para conferir a análise da Lolla:', confirmar: '',
            conteudo: `<ul class="gabarito">${r.gabarito.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>` });
        }
      } catch (err) {
        botao.disabled = false; botao.textContent = 'Importar';
      }
    });
  }

  /* ---------- Nova conciliação ---------- */
  const TIPOS_FRANCESINHA = ['.pdf', '.csv', '.txt', '.ret', '.xls', '.xlsx'];
  const lerBase64 = (arquivo) => new Promise((ok, falha) => {
    const fr = new FileReader();
    fr.onload = () => ok(String(fr.result).split(',')[1] || '');
    fr.onerror = () => falha(new Error('Não consegui ler o arquivo.'));
    fr.readAsDataURL(arquivo);
  });

  function abrirNovaConciliacao() {
    const s = store.get();
    const contas = s.contas.map((ct) => `<option value="${ct.id}" ${String(ct.id) === String(s.filtros.contaId) ? 'selected' : ''}>${esc(ct.descricao)}</option>`).join('');
    const fundo = document.createElement('div');
    fundo.className = 'dialogo-fundo';
    fundo.innerHTML = `<form class="dialogo largo nova-conc" role="dialog" aria-modal="true" aria-labelledby="nc-titulo" novalidate>
      <h3 id="nc-titulo">Nova conciliação</h3>
      <fieldset><legend>Extrato bancário</legend>
        <label class="opcao"><input type="radio" name="origem" value="conta" ${contas ? 'checked' : 'disabled'}><span><b>Conta já cadastrada</b><small>Usa o extrato que já está no IXC (simulado).</small></span></label>
        <label class="opcao"><input type="radio" name="origem" value="ofx" ${contas ? '' : 'checked'}><span><b>Importar arquivo OFX</b><small>O arquivo é lido aqui no navegador e vira uma conta nova com o extrato.</small></span></label>
      </fieldset>
      <label class="campo" id="nc-bloco-conta" ${contas ? '' : 'hidden'}>Conta<select id="nc-conta">${contas}</select></label>
      <div id="nc-bloco-ofx" class="campo" ${contas ? 'hidden' : ''}>
        <label class="arquivo">Arquivo OFX<input id="nc-ofx" type="file" accept=".ofx,.OFX,application/x-ofx"></label>
        <div id="nc-ofx-resumo"></div>
        <label class="campo">Lado do IXC (simulado)<select id="nc-modo">
          <option value="divergencias">Espelho com divergências (mostra o gabarito)</option>
          <option value="exato">Espelho exato (o código deve parear tudo)</option>
          <option value="vazio">IXC vazio (só o extrato)</option></select></label>
      </div>
      <div class="duas-datas"><label class="campo">De<input id="nc-ini" type="date" value="${esc(s.filtros.dataIni)}"></label>
        <label class="campo">Até<input id="nc-fim" type="date" value="${esc(s.filtros.dataFim)}"></label></div>
      <small class="nota">Para conciliar um dia só, use a mesma data nos dois campos.</small>
      <label class="arquivo">Francesinha (opcional)<input id="nc-fr" type="file" accept="${TIPOS_FRANCESINHA.join(',')}">
        <small>PDF, CSV, TXT, RET, XLS ou XLSX, até 10 MB. Fica cifrada neste navegador.</small></label>
      <label class="campo">Observação<textarea id="nc-obs" rows="3" maxlength="1000" placeholder="Contexto do chamado, o que o cliente relatou… Sem nomes, CPF ou CNPJ de clientes."></textarea></label>
      <div id="nc-erro"></div>
      <div class="dialogo-botoes"><button type="button" data-r="cancelar">Cancelar</button><button class="primario" id="nc-salvar">Criar conciliação</button></div>
    </form>`;
    document.body.appendChild(fundo);
    const q = (sel) => fundo.querySelector(sel);
    let ofx = null;
    const fechar = () => fundo.remove();
    const erro = (t) => { q('#nc-erro').innerHTML = t ? `<div class="alerta erro">${esc(t)}</div>` : ''; };
    fundo.addEventListener('click', (e) => { if (e.target === fundo || e.target.closest('[data-r="cancelar"]')) fechar(); });
    fundo.addEventListener('change', async (e) => {
      if (e.target.name === 'origem') {
        const deOfx = e.target.value === 'ofx';
        q('#nc-bloco-ofx').hidden = !deOfx; q('#nc-bloco-conta').hidden = deOfx; erro('');
      }
      if (e.target.id === 'nc-ofx') {
        const f = e.target.files[0]; ofx = null; erro('');
        if (!f) { q('#nc-ofx-resumo').innerHTML = ''; return; }
        q('#nc-ofx-resumo').innerHTML = Lolla.ui.c.spinner('Lendo o arquivo…');
        try {
          if (f.size > 5 * 1024 * 1024) throw new Error('OFX maior que 5 MB. Exporte um período menor.');
          ofx = Lolla.domain.ofx.interpretar(await Lolla.domain.ofx.lerArquivo(f), f.name);
          q('#nc-ofx-resumo').innerHTML = `<p class="ok-txt">${esc(ofx.conta.banco)} · ${ofx.resumo.total} lançamentos de ${Lolla.core.fmt.brDeIso(ofx.periodo.inicio)} a ${Lolla.core.fmt.brDeIso(ofx.periodo.fim)}.</p>`;
          q('#nc-ini').value = ofx.periodo.inicio; q('#nc-fim').value = ofx.periodo.fim;
        } catch (err) { q('#nc-ofx-resumo').innerHTML = ''; erro(err.message); }
      }
    });
    q('form').addEventListener('submit', async (e) => {
      e.preventDefault(); e.stopPropagation();
      const origem = fundo.querySelector('input[name="origem"]:checked').value;
      const dataIni = q('#nc-ini').value, dataFim = q('#nc-fim').value;
      if (origem === 'conta' && !q('#nc-conta').value) return erro('Escolha a conta.');
      if (origem === 'ofx' && !ofx) return erro('Escolha um arquivo OFX válido.');
      if (!dataIni || !dataFim) return erro('Informe o período (De e Até).');
      if (dataIni > dataFim) return erro('A data inicial é depois da data final.');
      let francesinha = null;
      const fr = q('#nc-fr').files[0];
      if (fr) {
        const ext = (fr.name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
        if (!TIPOS_FRANCESINHA.includes(ext)) return erro('Francesinha: use PDF, CSV, TXT, RET, XLS ou XLSX.');
        if (fr.size > 10 * 1024 * 1024) return erro('Francesinha: máximo de 10 MB.');
      }
      const botao = q('#nc-salvar');
      botao.disabled = true; botao.textContent = 'Criando…'; erro('');
      try {
        if (fr) francesinha = { nome: fr.name, tipo: fr.type || 'application/octet-stream', tamanho: fr.size, base64: await lerBase64(fr) };
        const r = await acoes.criarConciliacao({ origem, contaId: q('#nc-conta').value, ofx, modo: q('#nc-modo').value,
          dataIni, dataFim, observacao: q('#nc-obs').value.trim() }, francesinha);
        fechar();
        if (r.gabarito.length) {
          dialogo({ texto: `Conciliação #${r.reg.id} criada. Gabarito do que foi plantado no IXC, para conferir a análise da Lolla:`, confirmar: '',
            conteudo: `<ul class="gabarito">${r.gabarito.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>` });
        }
      } catch (err) { erro(err.message); botao.disabled = false; botao.textContent = 'Criar conciliação'; }
    });
  }

  async function baixarFrancesinha(id) {
    try {
      const f = await Lolla.services.conciliacoes.lerFrancesinha(id);
      if (!f) throw new Error('A francesinha desta conciliação não está neste navegador.');
      const bytes = Uint8Array.from(atob(f.base64), (ch) => ch.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: f.tipo }));
      const a = document.createElement('a'); a.href = url; a.download = f.nome; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { acoes.avisar('erro', e.message); }
  }

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
      acoes.iniciar();
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
    if (aba === 'contexto') await carregarContextos();
    if (aba === 'painel') await acoes.carregarPainel();
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
      case 'importar-ofx': return abrirImportacaoOfx();
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
      case 'nova-conciliacao': return abrirNovaConciliacao();
      case 'painel-recarregar': return acoes.carregarPainel();
      case 'painel-situacao': return acoes.atualizarSituacao(Number(alvo.dataset.id));
      case 'painel-filtro': return store.set({ painel: Object.assign({}, s.painel, { filtro: alvo.dataset.estado || '' }) });
      case 'abrir-conciliacao': return acoes.abrirConciliacao(Number(alvo.dataset.id));
      case 'baixar-francesinha': return baixarFrancesinha(Number(alvo.dataset.id));
      case 'excluir-conciliacao': {
        const id = Number(alvo.dataset.id);
        if (!(await confirmar(`Excluir a conciliação #${id} do painel? A francesinha guardada também é apagada. Os lançamentos do IXC (simulado) não mudam.`, { confirmar: 'Excluir', perigo: true }))) return;
        return acoes.excluirConciliacao(id);
      }
      case 'ctx-recarregar': return carregarContextos();
      case 'ctx-abrir': return setCtx({ aberto: Number(alvo.dataset.id), modo: 'ver', erroForm: null });
      case 'ctx-novo': vCtx().prepararRascunho(null); return setCtx({ modo: 'novo', erroForm: null });
      case 'ctx-editar': vCtx().prepararRascunho(s.ctx.lista.find((i) => i.id === s.ctx.aberto)); return setCtx({ modo: 'editar', erroForm: null });
      case 'ctx-cancelar': return setCtx({ modo: 'ver', erroForm: null });
      case 'ctx-apagar': {
        const item = s.ctx.lista.find((i) => i.id === s.ctx.aberto);
        if (!item || !(await confirmar(`Apagar "${item.titulo}"? Ele sai da lista e não vai mais para a IA (aqui e na extensão). Não dá para desfazer.`, { confirmar: 'Apagar', perigo: true }))) return;
        try { await ctxSrv.apagar(item.id); setCtx({ aberto: null }); await carregarContextos(); acoes.avisar('ok', 'Contexto apagado. Ele não vai mais para a IA.'); }
        catch (e) { acoes.avisar('erro', e.message); }
        return;
      }
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
      case 'carregar-cenario': {
        const id = document.getElementById('cfg-cenario').value;
        const nome = Lolla.services.cenarios[id].nome;
        if (!(await confirmar(`Carregar o ${nome}? A base simulada atual será substituída.`, { confirmar: 'Carregar' }))) return;
        await acoes.carregarCenario(id);
        return abrirAba('conciliacao');
      }
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
    if (form.dataset.form === 'ctx') return salvarContexto();
    if (form.dataset.form === 'ofx') return; // tratado no próprio diálogo
    if (form.dataset.form === 'filtros') return acoes.buscar();
    if (form.dataset.form === 'chat') {
      const inp = form.querySelector('#chat-entrada');
      const txt = inp.value; inp.value = '';
      return acoes.perguntar(txt);
    }
  });

  // Contexto da IA: o rascunho fica fora do store (digitar não redesenha a tela); só o contador muda
  document.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.id === 'ctx-titulo' || el.id === 'ctx-texto') {
      vCtx().rascunho[el.id === 'ctx-titulo' ? 'titulo' : 'texto'] = el.value;
      const cont = vCtx().contador(store.get()), alvo = document.getElementById('ctx-contador');
      if (alvo) { alvo.textContent = cont.texto; alvo.className = cont.passa ? 'erro-txt' : ''; }
    }
    if (el.id === 'ctx-busca') setCtx({ busca: el.value });
  });

  store.assinar(render);

  /* ---------- Início ---------- */
  if (!Lolla.services.cripto.disponivel()) {
    $('#app').innerHTML = '<div class="cofre"><div class="alerta erro">Este navegador não oferece criptografia (Web Crypto). Use Chrome ou Edge atualizados.</div></div>';
  } else {
    telaCofre();
  }
})();

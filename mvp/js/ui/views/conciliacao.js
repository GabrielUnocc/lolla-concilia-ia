/*
 * Tela de Conciliação (inspirada na Conciliação Manual do IXC) + painel da Lolla.
 */
Lolla.ui.views.conciliacao = (function () {
  const { esc, moeda, reais, brDeIso } = Lolla.core.fmt;
  const c = Lolla.ui.c;

  function statusLinha(s, l, prefixo) {
    if (l.conciliado) return 'conciliado';
    const st = s.pareamento && s.pareamento.status[prefixo + l.id];
    return st || 'sobra';
  }

  function grade(s, titulo, linhas, lado, prefixo, idTabela) {
    const sel = s.selecao[lado];
    const corpo = linhas.length ? linhas.map((l) => {
      const st = statusLinha(s, l, prefixo);
      const ref = prefixo + l.id;
      const classes = [sel.includes(l.id) ? 'sel' : '', s.destaque.includes(ref) ? 'destaque' : '', l.conciliado ? 'conc' : ''].join(' ');
      return `<tr class="${classes}" data-acao="selecionar" data-lado="${lado}" data-id="${esc(l.id)}">
        <td><input type="checkbox" ${sel.includes(l.id) ? 'checked' : ''} tabindex="-1" aria-label="Selecionar ${esc(ref)}"></td>
        <td abbr="${idTabela}.data">${brDeIso(l.data)}</td>
        <td abbr="${idTabela}.documento" class="mono">${esc(l.documento || (l.tx_id ? l.tx_id.slice(0, 10) + '…' : ''))}</td>
        <td abbr="${idTabela}.historico" class="hist" title="${esc(l.historico)}">${esc(l.historico)}${l.origem && lado === 'mov' ? ` <small>· ${esc(l.origem)}</small>` : ''}</td>
        <td abbr="${idTabela}.credito" class="num">${l.credito ? moeda(l.credito) : ''}</td>
        <td abbr="${idTabela}.debito" class="num">${l.debito ? moeda(l.debito) : ''}</td>
        <td>${c.selo(st, c.tomStatus[st] || 'cinza')}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="7">${c.vazio('Nenhum lançamento no período.')}</td></tr>`;
    return `<section class="grade">
      <h3>${esc(titulo)} <small>${linhas.length} linha(s)</small></h3>
      <div class="rolagem"><table>
        <thead><tr><th></th><th>Data</th><th>Doc./ID</th><th>Histórico</th><th class="num">Crédito</th><th class="num">Débito</th><th>Status</th></tr></thead>
        <tbody>${corpo}</tbody></table></div></section>`;
  }

  function rodape(s, ind) {
    const soma = (arr, ids) => arr.filter((l) => ids.includes(l.id)).reduce((a, l) => a + l.valor, 0);
    const selM = soma(s.movimentacao, s.selecao.mov), selE = soma(s.extrato, s.selecao.ext);
    const bate = (s.selecao.mov.length || s.selecao.ext.length) && selM === selE;
    const algumSel = s.selecao.mov.length + s.selecao.ext.length > 0;
    const umExt = s.selecao.ext.length === 1 && !s.selecao.mov.length;
    const umMov = s.selecao.mov.length === 1 && !s.selecao.ext.length;
    return `<section class="rodape" id="rodape_aba_3">
      <div class="totais">
        <div><span>Selecionado IXC</span><b id="total_selecionado_aba3_mov">${reais(selM)}</b></div>
        <div><span>Selecionado banco</span><b id="total_selecionado_aba3_ext">${reais(selE)}</b></div>
        <div class="${algumSel ? (bate ? 'ok' : 'nok') : ''}"><span>Diferença seleção</span><b>${reais(selM - selE)}</b></div>
        <div><span>A conciliar IXC</span><b id="total_a_conciliar_aba3_mov">${reais(ind.totalIxc)}</b></div>
        <div><span>A conciliar banco</span><b id="total_a_conciliar_aba3_ext">${reais(ind.totalBanco)}</b></div>
        <div class="${ind.diferenca ? 'nok' : 'ok'}"><span>Diferença</span><b id="diferenca_aba3">${reais(ind.diferenca)}</b></div>
      </div>
      <div class="botoes">
        <button data-acao="conciliar" ${bate ? '' : 'disabled'} class="primario">Conciliar seleção</button>
        <button data-acao="desconciliar" ${algumSel ? '' : 'disabled'}>Desfazer conciliação</button>
        <button data-acao="lancar" ${umExt ? '' : 'disabled'} title="Selecione 1 linha do extrato">Lançar no IXC</button>
        <button data-acao="estornar" ${umMov ? '' : 'disabled'} title="Selecione 1 linha do IXC">Estornar baixa</button>
        <button data-acao="limpar-selecao" ${algumSel ? '' : 'disabled'}>Limpar seleção</button>
        <span class="sep"></span>
        <button data-acao="conciliar-pares" ${s.pareamento && s.pareamento.pares.length ? '' : 'disabled'}>Conciliar ${s.pareamento ? s.pareamento.pares.filter((p) => !p.ambiguo).length : 0} par(es) automático(s)</button>
      </div>
    </section>`;
  }

  const rotAcao = {
    lancar_no_ixc: 'Lançar no IXC', estornar_baixa: 'Estornar baixa', conciliar_manual: 'Selecionar para conciliar',
    ajustar_data: 'Selecionar linhas', verificar_com_cliente: 'Selecionar linhas', nenhuma: 'Selecionar linhas'
  };
  const tomCerteza = { alta: 'verde', media: 'amarelo', baixa: 'laranja' };

  function painelIA(s) {
    const st = Lolla.services.claude.status();
    const cab = `<div class="ia-cab">
      <div><h3>Análise da Lolla</h3>
        <small>${st.simulada ? 'IA simulada (regras locais)' : 'Claude · ' + esc(st.modelo)} · envia só valor, data, documento, IDs e histórico mascarado</small></div>
      <button data-acao="analisar" class="primario" ${s.analisando || !s.pareamento ? 'disabled' : ''}>${s.analisando ? 'Analisando…' : 'Analisar sobras com IA'}</button>
    </div>`;
    if (s.analisando) return cab + c.spinner('A Lolla está analisando as sobras…');
    if (s.erroIA) return cab + `<div class="alerta erro">${esc(s.erroIA)} <button data-acao="analisar">Tentar novamente</button></div>`;
    const a = s.analise;
    if (!a) {
      const ind = s.pareamento ? Lolla.acoes.indicadoresAtuais() : null;
      return cab + c.vazio(ind ? `O código pareou ${ind.linhasPareadas} de ${ind.linhasPendentes} linhas pendentes. Sobraram ${ind.sobrasIxc} no IXC e ${ind.sobrasBanco} no banco.` : 'Busque um período para começar.');
    }
    const r = a.resultado;
    const itens = r.itens.map((it, k) => {
      const d = a.decisoes[k];
      const refs = (it.refs || []).map((x) => `<code>${esc(x)}</code>`).join(' ');
      const acao = it.acao_sugerida;
      const ref0 = (it.refs || [])[0] || '';
      let botaoAcao = `<button data-acao="ver-refs" data-refs="${esc((it.refs || []).join(','))}">${esc(rotAcao[acao] || 'Selecionar linhas')}</button>`;
      if (acao === 'lancar_no_ixc' && ref0.startsWith('E:')) botaoAcao = `<button data-acao="lancar-ref" data-id="${esc(ref0.slice(2))}">Lançar no IXC</button>`;
      if (acao === 'estornar_baixa' && ref0.startsWith('M:')) botaoAcao = `<button data-acao="estornar-ref" data-id="${esc(ref0.slice(2))}">Estornar baixa</button>`;
      return `<article class="card ${d || ''}">
        <header>${c.selo(it.categoria || 'outra', 'azul')} ${c.selo('certeza ' + (it.certeza || '?'), tomCerteza[it.certeza] || 'cinza')} <span class="refs">${refs}</span></header>
        <p><b>Causa:</b> ${esc(it.causa)}</p>
        <p><b>Próximo passo:</b> ${esc(it.proximo_passo)}</p>
        <footer>
          <button data-acao="ver-refs" data-refs="${esc((it.refs || []).join(','))}">Mostrar linhas</button>
          ${botaoAcao}
          <span class="sep"></span>
          ${d ? `<span class="decisao">Sugestão ${esc(d)}</span> <button data-acao="decidir" data-k="${k}" data-d="">Desfazer</button>`
              : `<button data-acao="decidir" data-k="${k}" data-d="aceita" class="ok">Aceitar</button><button data-acao="decidir" data-k="${k}" data-d="rejeitada" class="nok">Rejeitar</button>`}
        </footer></article>`;
    }).join('');
    const perguntas = r.perguntas_ao_cliente.length
      ? `<div class="perguntas"><b>Perguntar ao cliente:</b><ul>${r.perguntas_ao_cliente.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>` : '';
    const chat = s.chat.map((m) => `<div class="msg ${m.papel}">${esc(m.texto)}</div>`).join('');
    return cab + `<div class="resumo">${esc(r.resumo)}</div>${perguntas}<div class="cards">${itens}</div>
      <div class="ia-acoes"><button data-acao="copiar-resumo">Copiar resumo para o atendimento</button>
        ${a.usage ? `<small>${a.usage.input_tokens} tokens de entrada · ${a.usage.output_tokens} de saída</small>` : ''}</div>
      <div class="chat"><div class="msgs">${chat}${s.conversando ? '<div class="msg lolla">…</div>' : ''}</div>
        <form data-form="chat"><input id="chat-entrada" autocomplete="off" placeholder="Pergunte à Lolla sobre esta análise…" ${s.conversando ? 'disabled' : ''}>
        <button class="primario" ${s.conversando ? 'disabled' : ''}>Enviar</button></form></div>`;
  }

  function render(s) {
    const contas = s.contas.map((ct) => `<option value="${ct.id}" ${String(ct.id) === String(s.filtros.contaId) ? 'selected' : ''}>${esc(ct.descricao)}</option>`).join('');
    const filtros = `<form class="filtros" id="box_search_tab_3" data-form="filtros">
      <label>Conta<select id="f-conta" name="contaId">${contas}</select></label>
      <label>De<input id="f-ini" type="date" name="dataIni" value="${esc(s.filtros.dataIni)}"></label>
      <label>Até<input id="f-fim" type="date" name="dataFim" value="${esc(s.filtros.dataFim)}"></label>
      <button class="primario" ${s.carregando ? 'disabled' : ''}>Buscar</button>
      <button type="button" data-acao="importar-ofx" ${s.carregando ? 'disabled' : ''}>Importar OFX</button>
    </form>`;
    let corpo;
    if (s.erro) corpo = `<div class="alerta erro">${esc(s.erro.texto)} <button data-acao="repetir">Tentar novamente</button></div>`;
    else if (!s.pareamento) corpo = s.carregando ? c.spinner('Consultando o IXC…') : c.vazio('Escolha a conta e o período e clique em Buscar.');
    else {
      const ind = Lolla.acoes.indicadoresAtuais();
      corpo = `${s.carregando ? '<div class="faixa-carregando">Atualizando…</div>' : ''}
        <div class="grades">
          ${grade(s, 'Movimentação Financeira (IXC)', s.movimentacao, 'mov', 'M:', 'fn_movim_finan')}
          ${grade(s, 'Extrato Bancário (OFX)', s.extrato, 'ext', 'E:', 'fn_extrato')}
        </div>
        ${rodape(s, ind)}
        <section class="painel-ia">${painelIA(s)}</section>`;
    }
    return filtros + corpo;
  }

  return { render };
})();

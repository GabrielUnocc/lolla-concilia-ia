/*
 * Painel (primeira tela depois de entrar): quantas conciliações estão abertas, em andamento
 * e fechadas, e a lista de conciliações registradas.
 */
Lolla.ui.views.painel = (function () {
  const { esc, reais, brDeIso, dataHora } = Lolla.core.fmt;
  const c = Lolla.ui.c;
  const conc = () => Lolla.services.conciliacoes;
  const TOM = { aberta: 'laranja', andamento: 'amarelo', fechada: 'verde' };
  const periodo = (r) => (r.dataIni === r.dataFim ? brDeIso(r.dataIni) : `${brDeIso(r.dataIni)} a ${brDeIso(r.dataFim)}`);
  const tamanho = (b) => (b > 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

  function kpi(estado, rotulo, n, ativo) {
    return `<button class="kpi kpi-filtro ${estado} ${ativo ? 'ativo' : ''}" data-acao="painel-filtro" data-estado="${estado}" aria-pressed="${ativo}">
      <div class="kpi-rot">${esc(rotulo)}</div><div class="kpi-val">${n == null ? '…' : n}</div></button>`;
  }

  function situacao(r) {
    if (r.erroSt) return `<span class="erro-txt" title="${esc(r.erroSt)}">Não consultada</span> <button class="mini" data-acao="painel-situacao" data-id="${r.id}">Tentar de novo</button>`;
    if (!r.st) return '<span class="giro pequeno"></span> consultando…';
    return c.selo(conc().ROTULOS[r.st.estado], TOM[r.st.estado]);
  }

  function render(s) {
    const p = s.painel;
    const topo = `<div class="painel-topo"><h2>Painel de conciliações</h2><button class="primario" data-acao="nova-conciliacao">+ Nova conciliação</button></div>`;
    if (p.erro) return topo + `<div class="alerta erro">${esc(p.erro)} <button data-acao="painel-recarregar">Tentar novamente</button></div>`;
    if (!p.lista) return topo + c.spinner('Carregando as conciliações…');

    const prontas = p.lista.filter((r) => r.st);
    const conta = (e) => (prontas.length === p.lista.length ? prontas.filter((r) => r.st.estado === e).length : null);
    const kpis = `<div class="kpis kpis-painel">
      ${kpi('', 'Todas', p.lista.length, !p.filtro)}
      ${kpi('aberta', 'Abertas', conta('aberta'), p.filtro === 'aberta')}
      ${kpi('andamento', 'Em andamento', conta('andamento'), p.filtro === 'andamento')}
      ${kpi('fechada', 'Fechadas', conta('fechada'), p.filtro === 'fechada')}
    </div>
    <p class="nota">Aberta: nada conciliado ainda · Em andamento: parte conciliada, ainda com pendência · Fechada: tudo conciliado, sem diferença. Clique num total para filtrar.</p>`;

    if (!p.lista.length) return topo + kpis + c.vazio('Nenhuma conciliação ainda. Clique em + Nova conciliação para registrar a primeira (conta, período, OFX e francesinha).');
    const lista = p.lista.filter((r) => !p.filtro || (r.st && r.st.estado === p.filtro)).slice().sort((a, b) => b.id - a.id);
    const linhas = lista.length ? lista.map((r) => {
      const st = r.st;
      return `<tr>
        <td class="num">${r.id}</td>
        <td>${esc(r.contaDescricao)}</td>
        <td>${periodo(r)}</td>
        <td>${situacao(r)}</td>
        <td class="num">${st ? `${st.conciliadas} de ${st.total}` : ''}</td>
        <td class="num">${st ? `${st.pendentesIxc} / ${st.pendentesBanco}` : ''}</td>
        <td class="num ${st && st.diferenca ? 'erro-txt' : ''}">${st ? reais(st.diferenca) : ''}</td>
        <td class="arquivos">${r.ofx ? c.selo('OFX', 'azul') : ''}
          ${r.francesinha ? `<button class="mini" data-acao="baixar-francesinha" data-id="${r.id}" title="${esc(r.francesinha.nome)} (${tamanho(r.francesinha.tamanho)})">Francesinha ↓</button>` : ''}</td>
        <td>${dataHora(r.criadaEm)}</td>
        <td class="acoes"><button class="primario mini" data-acao="abrir-conciliacao" data-id="${r.id}">Abrir</button>
          <button class="mini nok" data-acao="excluir-conciliacao" data-id="${r.id}">Excluir</button></td>
      </tr>`;
    }).join('') : `<tr><td colspan="10">${c.vazio('Nenhuma conciliação nesta situação.')}</td></tr>`;

    return topo + kpis + `<div class="rolagem tabela-painel"><table class="simples"><thead><tr>
        <th class="num">#</th><th>Conta</th><th>Período</th><th>Situação</th><th class="num">Linhas conciliadas</th>
        <th class="num">Pendentes IXC / banco</th><th class="num">Diferença</th><th>Arquivos</th><th>Criada em</th><th></th>
      </tr></thead><tbody>${linhas}</tbody></table></div>`;
  }

  return { render, periodo, TOM };
})();

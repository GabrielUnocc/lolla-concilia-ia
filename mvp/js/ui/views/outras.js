/*
 * Telas de Indicadores, Histórico e Configurações.
 */
Lolla.ui.views.indicadores = (function () {
  const { esc, reais, pct, brDeIso } = Lolla.core.fmt;
  const c = Lolla.ui.c;

  function render(s) {
    const uso = Lolla.domain.indicadores.deUso(s.historico || [], Lolla.core.config.get().custo);
    let blocoConc = c.vazio('Busque um período na aba Conciliação para ver os indicadores da conciliação.');
    if (s.pareamento) {
      const ind = Lolla.acoes.indicadoresAtuais();
      const linhasTab = (obj, vazioTxt) => Object.keys(obj).length
        ? Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v}</td></tr>`).join('')
        : `<tr><td colspan="2">${esc(vazioTxt)}</td></tr>`;
      blocoConc = `<p class="lead">Período ${brDeIso(s.filtros.dataIni)} a ${brDeIso(s.filtros.dataFim)}: diferença de <b>${reais(ind.diferenca)}</b> (IXC − banco), com ${pct(ind.taxaAutomatica)} das linhas pendentes pareadas pelo código.</p>
        <div class="kpis">
          ${c.kpi('A conciliar IXC', reais(ind.totalIxc))}
          ${c.kpi('A conciliar banco', reais(ind.totalBanco))}
          ${c.kpi('Diferença', reais(ind.diferenca), 'IXC − banco', ind.diferenca ? 'alerta' : 'bom')}
          ${c.kpi('Pareado pelo código', pct(ind.taxaAutomatica), `${ind.linhasPareadas} de ${ind.linhasPendentes} linhas pendentes`)}
          ${c.kpi('Sobras', String(ind.sobrasIxc + ind.sobrasBanco), `${ind.sobrasIxc} IXC · ${ind.sobrasBanco} banco`)}
          ${c.kpi('Já conciliadas', String(ind.conciliadas), `de ${ind.linhasTotais} linhas`)}
        </div>
        <h3>Diferença por dia</h3>${c.graficoDiferenca(ind.porDia)}
        <div class="duas">
          <div><h3>Pares automáticos por regra</h3><table class="simples"><tbody>${linhasTab(ind.paresPorTipo, 'Nenhum par')}
            <tr><td>ambíguos (mesmo valor e data)</td><td class="num">${ind.ambiguos}</td></tr>
            <tr><td>possíveis duplicados</td><td class="num">${ind.duplicados}</td></tr></tbody></table></div>
          <div><h3>Sobras do banco por tipo</h3><table class="simples"><tbody>${linhasTab(ind.sobrasPorClasse, 'Nenhuma sobra no banco')}</tbody></table></div>
        </div>`;
    }
    const causas = uso.causas.length ? uso.causas.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v}</td></tr>`).join('') : '<tr><td colspan="2">Sem análises ainda.</td></tr>';
    return `<h2>Conciliação atual</h2>${blocoConc}
      <h2>Uso da Lolla</h2>
      <div class="kpis">
        ${c.kpi('Análises', String(uso.analises), `${uso.analisesReais} com Claude · ${uso.simuladas} simuladas`)}
        ${c.kpi('Sugestões', String(uso.sugestoes))}
        ${c.kpi('Taxa de aceite', pct(uso.taxaAceite), `${uso.aceitas} aceitas · ${uso.rejeitadas} rejeitadas`)}
        ${c.kpi('Tokens', (uso.tokensEntrada + uso.tokensSaida).toLocaleString('pt-BR'), `${uso.tokensEntrada.toLocaleString('pt-BR')} entrada · ${uso.tokensSaida.toLocaleString('pt-BR')} saída`)}
        ${c.kpi('Custo estimado', reais(uso.custoReaisCentavos), `média ${reais(uso.custoMedioCentavos)} por análise`)}
      </div>
      <h3>Causas mais sugeridas</h3><table class="simples"><tbody>${causas}</tbody></table>`;
  }
  return { render };
})();

Lolla.ui.views.historico = (function () {
  const { esc, dataHora, brDeIso } = Lolla.core.fmt;
  const c = Lolla.ui.c;
  function render(s) {
    const h = (s.historico || []).slice().reverse();
    if (!h.length) return '<h2>Histórico de análises</h2>' + c.vazio('Nenhuma análise ainda.');
    const conta = (id) => (s.contas.find((x) => String(x.id) === String(id)) || {}).descricao || id;
    return `<h2>Histórico de análises</h2><p class="lead">Guardado cifrado neste navegador. Últimas ${h.length} análise(s).</p>
      <div class="rolagem"><table class="simples"><thead><tr><th>Quando</th><th>Conta</th><th>Período</th><th class="num">Diferença</th><th class="num">Sobras</th><th>IA</th><th class="num">Sugestões</th><th>Decisões</th></tr></thead><tbody>
      ${h.map((a) => {
        const dec = Object.values(a.decisoes || {});
        return `<tr><td>${dataHora(a.em)}</td><td>${esc(conta(a.contaId))}</td><td>${brDeIso(a.filtros.dataIni)}–${brDeIso(a.filtros.dataFim)}</td>
          <td class="num">${Lolla.core.fmt.moeda(Math.round(a.diferenca * 100))}</td><td class="num">${a.sobras}</td>
          <td>${a.simulado ? c.selo('simulada', 'cinza') : c.selo(a.modelo || 'Claude', 'azul')}</td>
          <td class="num">${a.resultado.itens.length}</td>
          <td>${dec.filter((d) => d === 'aceita').length} aceitas · ${dec.filter((d) => d === 'rejeitada').length} rejeitadas</td></tr>`;
      }).join('')}</tbody></table></div>`;
  }
  return { render };
})();

Lolla.ui.views.configuracoes = (function () {
  const { esc } = Lolla.core.fmt;
  const c = Lolla.ui.c;
  function render(s) {
    const st = Lolla.services.claude.status();
    const cfg = Lolla.core.config.get();
    const forcar = Lolla.services.armazenamento.publico.ler('forcar_ia_simulada') === true;
    return `<h2>Configurações</h2>
      <section class="bloco"><h3>API do Claude</h3>
        ${cfg.arquivoEncontrado ? '' : '<div class="alerta erro">config.js não encontrado. Copie config.example.js para config.js.</div>'}
        <table class="simples"><tbody>
          <tr><td>Chave</td><td>${st.temCredencial ? c.selo('configurada', 'verde') : c.selo('não configurada — usando IA simulada', 'laranja')}</td></tr>
          <tr><td>Modelo</td><td><code>${esc(st.modelo)}</code></td></tr>
          <tr><td>Autenticação</td><td><code>${esc(st.autenticacao)}</code></td></tr>
          <tr><td>Endereço</td><td><code>${esc(st.baseUrl)}</code></td></tr></tbody></table>
        <p><label class="check"><input type="checkbox" data-acao="forcar-simulada" ${forcar ? 'checked' : ''}> Usar IA simulada mesmo com chave (não gasta tokens)</label></p>
        <p><button data-acao="testar-claude" ${st.temCredencial ? '' : 'disabled'}>Testar conexão</button> <span id="teste-claude">${esc(s.testeClaude || '')}</span></p>
        <p class="nota">A chave e o modelo vêm do arquivo config.js. Ela fica visível no navegador: use só neste computador, nunca publique.</p>
      </section>
      <section class="bloco"><h3>Cenário de teste</h3>
        <label>Base simulada<select id="cfg-cenario">${Object.entries(Lolla.services.cenarios).map(([id, cn]) =>
          `<option value="${esc(id)}" ${id === s.cenario ? 'selected' : ''}>${esc(cn.nome)}</option>`).join('')}</select></label>
        <p class="nota">${esc((Lolla.services.cenarios[s.cenario] || {}).descricao || '')}</p>
        <p><button data-acao="carregar-cenario" class="primario">Carregar cenário</button> <small>Troca a base simulada e volta para a Conciliação.</small></p>
      </section>
      <section class="bloco"><h3>IXC simulado</h3>
        <label>Taxa de erro das consultas: <b>${Math.round(cfg.ixc.taxaErro * 100)}%</b>
          <input type="range" min="0" max="50" step="5" value="${Math.round(cfg.ixc.taxaErro * 100)}" data-acao="taxa-erro"></label>
        <label>Latência máxima: <b>${cfg.ixc.latenciaMaxMs} ms</b>
          <input type="range" min="0" max="3000" step="100" value="${cfg.ixc.latenciaMaxMs}" data-acao="latencia"></label>
        <p><button data-acao="restaurar-base">Restaurar base simulada</button> <small>Desfaz conciliações, lançamentos e estornos feitos nos testes.</small></p>
      </section>
      <section class="bloco"><h3>Dados locais</h3>
        <p>Base simulada e histórico ficam cifrados (AES-GCM) com a sua senha local.</p>
        <p><button data-acao="bloquear">Bloquear agora</button> <button data-acao="apagar-tudo" class="nok">Apagar todos os dados locais</button></p>
      </section>`;
  }
  return { render };
})();

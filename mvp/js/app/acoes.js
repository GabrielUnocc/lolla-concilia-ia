/*
 * Ações da aplicação: ligam a interface aos serviços e atualizam o estado.
 * A interface só chama estas funções; ela não conversa direto com IXC, IA ou armazenamento.
 */
Lolla.acoes = (function () {
  const store = Lolla.core.store;
  const ixc = Lolla.services.ixc;
  const ia = Lolla.services.claude;
  const seguro = Lolla.services.armazenamento.seguro;
  const { parear } = Lolla.domain.pareamento;
  const indicadores = Lolla.domain.indicadores;
  const mascaramento = Lolla.domain.mascaramento;
  const HIST = 'historico_analises';

  const avisar = (tipo, texto) => {
    store.set({ aviso: { tipo, texto, em: Date.now() } });
    setTimeout(() => { if (store.get().aviso && Date.now() - store.get().aviso.em >= 4000) store.set({ aviso: null }); }, 4100);
  };

  function recalcular(mov, ext) {
    const pareamento = parear(mov, ext);
    store.set({ movimentacao: mov, extrato: ext, pareamento, selecao: { mov: [], ext: [] } });
  }

  function indicadoresAtuais() {
    const s = store.get();
    return indicadores.daConciliacao({ movimentacao: s.movimentacao, extrato: s.extrato, pareamento: s.pareamento });
  }

  function payloadAtual() {
    const s = store.get();
    const conta = s.contas.find((c) => String(c.id) === String(s.filtros.contaId));
    return mascaramento.montarPayload({ conta, filtros: s.filtros, pareamento: s.pareamento, indicadores: indicadoresAtuais() });
  }

  async function lerHistorico() { return (await seguro.ler(HIST)) || []; }
  async function gravarHistorico(h) { await seguro.gravar(HIST, h.slice(-200)); }

  return {
    avisar,
    indicadoresAtuais,
    payloadAtual,
    lerHistorico,

    // Ao abrir: usa o período do cenário de teste carregado
    async iniciar() {
      try {
        const id = await ixc.cenarioAtual();
        const cen = id && Lolla.services.cenarios[id];
        if (cen) store.set({ cenario: id, filtros: Object.assign({}, store.get().filtros, cen.periodo, { contaId: null }) });
      } catch (e) { /* segue com o padrão */ }
      await this.carregarContas();
      if (store.get().contas.length) await this.buscar();
    },

    async carregarCenario(id) {
      store.set({ carregando: true });
      try {
        await ixc.restaurarBase(id);
        await this.iniciar();
        avisar('ok', 'Cenário carregado: ' + Lolla.services.cenarios[id].nome);
      } catch (e) { store.set({ carregando: false }); avisar('erro', e.message); }
    },

    async carregarContas() {
      store.set({ carregando: true, erro: null });
      try {
        const contas = await ixc.listarContas();
        const f = store.get().filtros;
        const valida = contas.some((c) => String(c.id) === String(f.contaId));
        store.set({ contas, carregando: false, filtros: Object.assign({}, f, { contaId: valida ? f.contaId : (contas[0] && contas[0].id) }) });
      } catch (e) {
        store.set({ carregando: false, erro: { texto: e.message, repetir: 'carregarContas' } });
      }
    },

    async buscar() {
      const f = store.get().filtros;
      store.set({ carregando: true, erro: null, analise: null, erroIA: null, chat: [], destaque: [] });
      try {
        const { movimentacao, extrato } = await ixc.buscarTela(f);
        recalcular(movimentacao, extrato);
        store.set({ carregando: false });
      } catch (e) {
        store.set({ carregando: false, erro: { texto: e.message, repetir: 'buscar' } });
      }
    },

    filtrar(parcial) {
      store.set({ filtros: Object.assign({}, store.get().filtros, parcial) });
    },

    alternarSelecao(lado, id) {
      const sel = store.get().selecao;
      const lista = sel[lado].includes(id) ? sel[lado].filter((x) => x !== id) : sel[lado].concat(id);
      store.set({ selecao: Object.assign({}, sel, { [lado]: lista }) });
    },

    selecionarRefs(refs) {
      const mov = refs.filter((r) => r.startsWith('M:')).map((r) => r.slice(2));
      const ext = refs.filter((r) => r.startsWith('E:')).map((r) => r.slice(2));
      store.set({ selecao: { mov, ext }, destaque: refs });
    },

    limparSelecao() { store.set({ selecao: { mov: [], ext: [] }, destaque: [] }); },

    async conciliarSelecao() {
      const { mov, ext } = store.get().selecao;
      try {
        store.set({ carregando: true });
        const r = await ixc.conciliar({ movIds: mov, extIds: ext });
        await this.buscarSemLimpar();
        avisar('ok', r.conciliados + ' linha(s) conciliada(s).');
      } catch (e) {
        store.set({ carregando: false });
        avisar('erro', e.message);
      }
    },

    async conciliarParesAutomaticos() {
      const p = store.get().pareamento;
      const pares = p ? p.pares.filter((x) => !x.ambiguo) : [];
      if (!pares.length) return avisar('erro', 'Não há pares automáticos para conciliar.');
      store.set({ carregando: true });
      let ok = 0, falhas = 0;
      for (const par of pares) {
        try { await ixc.conciliar({ movIds: par.ixc, extIds: par.extrato }); ok++; } catch (e) { falhas++; }
      }
      await this.buscarSemLimpar();
      avisar(falhas ? 'erro' : 'ok', `${ok} par(es) conciliado(s)` + (falhas ? `, ${falhas} falharam (tente de novo).` : '.'));
    },

    async desconciliarSelecao() {
      const { mov, ext } = store.get().selecao;
      try {
        store.set({ carregando: true });
        await ixc.desconciliar({ movIds: mov, extIds: ext });
        await this.buscarSemLimpar();
        avisar('ok', 'Conciliação desfeita.');
      } catch (e) { store.set({ carregando: false }); avisar('erro', e.message); }
    },

    async lancarNoIxc(extId) {
      try {
        store.set({ carregando: true });
        await ixc.lancarRecebimento({ extId });
        await this.buscarSemLimpar();
        avisar('ok', 'Lançamento criado no IXC (simulado). Revise e concilie.');
      } catch (e) { store.set({ carregando: false }); avisar('erro', e.message); }
    },

    async estornarBaixa(movId) {
      try {
        store.set({ carregando: true });
        await ixc.estornarBaixa({ movId });
        await this.buscarSemLimpar();
        avisar('ok', 'Baixa estornada (simulado).');
      } catch (e) { store.set({ carregando: false }); avisar('erro', e.message); }
    },

    // Recarrega as grades mantendo a análise da IA na tela
    async buscarSemLimpar() {
      try {
        const { movimentacao, extrato } = await ixc.buscarTela(store.get().filtros);
        recalcular(movimentacao, extrato);
        store.set({ carregando: false, erro: null });
      } catch (e) {
        store.set({ carregando: false, erro: { texto: e.message, repetir: 'buscar' } });
      }
    },

    async analisar() {
      const s = store.get();
      if (!s.pareamento) return;
      const payload = payloadAtual();
      if (!payload.so_no_ixc.length && !payload.so_no_banco.length && !payload.possiveis_duplicados.length && !payload.pares_ambiguos.length) {
        return avisar('ok', 'Nada sobrou: o código pareou tudo. Não é preciso chamar a IA.');
      }
      store.set({ analisando: true, erroIA: null, chat: [] });
      try {
        const r = await ia.analisar(payload);
        const registro = {
          id: 'A' + Date.now(), em: Date.now(), contaId: s.filtros.contaId, filtros: Object.assign({}, s.filtros),
          diferenca: payload.totais_calculados_pelo_codigo.diferenca_ixc_menos_banco,
          sobras: payload.so_no_ixc.length + payload.so_no_banco.length,
          resultado: r.resultado, simulado: r.simulado, usage: r.usage, modelo: r.modelo || null, decisoes: {}
        };
        const h = await lerHistorico(); h.push(registro); await gravarHistorico(h);
        store.set({ analisando: false, analise: registro });
      } catch (e) {
        store.set({ analisando: false, erroIA: e.message });
      }
    },

    async decidir(indice, decisao) {
      const a = store.get().analise;
      if (!a) return;
      const atual = Object.assign({}, a, { decisoes: Object.assign({}, a.decisoes, { [indice]: decisao }) });
      const h = await lerHistorico();
      const k = h.findIndex((x) => x.id === a.id);
      if (k >= 0) { h[k] = atual; await gravarHistorico(h); }
      store.set({ analise: atual });
    },

    async perguntar(texto) {
      const s = store.get();
      if (!texto.trim() || !s.analise) return;
      const chat = s.chat.concat({ papel: 'usuario', texto });
      store.set({ chat, conversando: true });
      try {
        const r = await ia.conversar(chat, payloadAtual(), s.analise.resultado);
        if (r.usage) {
          const h = await lerHistorico();
          const k = h.findIndex((x) => x.id === s.analise.id);
          if (k >= 0 && h[k].usage) {
            h[k].usage.input_tokens += r.usage.input_tokens || 0;
            h[k].usage.output_tokens += r.usage.output_tokens || 0;
            await gravarHistorico(h);
          }
        }
        store.set({ chat: store.get().chat.concat({ papel: 'lolla', texto: r.texto }), conversando: false });
      } catch (e) {
        store.set({ chat: store.get().chat.concat({ papel: 'erro', texto: e.message }), conversando: false });
      }
    },

    resumoParaAtendimento() {
      const s = store.get(), a = s.analise;
      if (!a) return '';
      const fmt = Lolla.core.fmt;
      const conta = s.contas.find((c) => String(c.id) === String(s.filtros.contaId));
      const linhas = [
        `Análise de conciliação — ${conta ? conta.descricao : ''}, ${fmt.brDeIso(s.filtros.dataIni)} a ${fmt.brDeIso(s.filtros.dataFim)}`,
        `Diferença (IXC − banco): R$ ${fmt.moeda(Math.round(a.diferenca * 100))}`,
        '', a.resultado.resumo || '', ''
      ];
      a.resultado.itens.forEach((it, k) => {
        const dec = a.decisoes[k] ? ` [${a.decisoes[k]}]` : '';
        linhas.push(`${k + 1}. ${it.categoria} (${it.refs.join(', ')}) — ${it.causa} Próximo passo: ${it.proximo_passo}${dec}`);
      });
      if (a.resultado.perguntas_ao_cliente.length) {
        linhas.push('', 'Perguntas ao cliente:');
        a.resultado.perguntas_ao_cliente.forEach((p) => linhas.push('- ' + p));
      }
      return linhas.join('\n');
    }
  };
})();

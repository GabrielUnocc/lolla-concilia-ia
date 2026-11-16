/*
 * IA SIMULADA: usada quando não há chave configurada (ou quando escolhida nas
 * Configurações). Aplica regras simples sobre o mesmo payload que iria para o Claude,
 * devolvendo o mesmo formato de resposta. Serve para testar a interface sem gastar tokens.
 */
Lolla.services.iaSimulada = (function () {
  const { dia, brDeIso } = Lolla.core.fmt;
  const brl = (v) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

  async function analisar(payload) {
    await espera(900);
    const itens = [];
    const tratadas = new Set();

    payload.possiveis_duplicados.forEach((d) => {
      const pend = d.pendentes || d.refs;
      const estornar = pend[pend.length - 1];
      itens.push({ refs: [estornar], categoria: 'baixa duplicada', causa: `Documento ${d.documento} baixado ${d.refs.length} vezes; o banco creditou uma vez.`,
        proximo_passo: 'Conferir as baixas do título no financeiro e estornar a baixa repetida (provável consulta de pagamentos ou baixa manual).',
        acao_sugerida: 'estornar_baixa', certeza: 'alta' });
      d.refs.forEach((r) => tratadas.add(r));
    });

    (payload.linhas_repetidas_no_ofx || []).forEach((d) => {
      const sobra = (d.pendentes || []).find((r) => payload.so_no_banco.some((e) => e.ref === r));
      if (!sobra) return;
      itens.push({ refs: [sobra], categoria: 'ofx duplicado', causa: `O documento ${d.documento} aparece ${d.refs.length} vezes no extrato importado; o IXC tem uma baixa só.`,
        proximo_passo: 'Conferir o extrato no internet banking; se o crédito foi um só, excluir a linha repetida do OFX importado e reimportar.',
        acao_sugerida: 'nenhuma', certeza: 'alta' });
      tratadas.add(sobra);
    });

    payload.so_no_ixc.forEach((m) => {
      if (tratadas.has(m.ref)) return;
      const mesmo = payload.so_no_banco.find((e) => !tratadas.has(e.ref) && e.valor === m.valor && dia(e.data) - dia(m.data) > 1);
      if (mesmo) {
        itens.push({ refs: [m.ref, mesmo.ref], categoria: 'data de crédito', causa: `Mesmo valor (${brl(m.valor)}): IXC em ${brDeIso(m.data)}, banco em ${brDeIso(mesmo.data)}.`,
          proximo_passo: 'Verificar float da carteira e data de crédito do retorno; se o valor é o mesmo, conciliar manualmente o par.',
          acao_sugerida: 'conciliar_manual', certeza: 'media' });
        tratadas.add(m.ref); tratadas.add(mesmo.ref);
        return;
      }
      const manual = /manual/i.test(m.origem_baixa || '');
      itens.push({ refs: [m.ref], categoria: manual ? 'recebimento manual' : 'retenção pelo banco',
        causa: manual ? 'Baixa manual no IXC sem crédito correspondente no extrato.' : 'Baixa no IXC sem crédito no período; banco pode ter retido ou creditado depois.',
        proximo_passo: manual ? 'Perguntar ao cliente se o valor foi recebido em dinheiro ou em outra conta; ajustar a conta da baixa.' : 'Consultar o extrato dos dias seguintes e a francesinha do banco.',
        acao_sugerida: 'verificar_com_cliente', certeza: manual ? 'alta' : 'baixa' });
      tratadas.add(m.ref);
    });

    const porClasse = {
      tarifa: ['tarifa', 'Tarifa bancária no extrato sem lançamento no IXC.', 'Lançar a tarifa como despesa no IXC na conta conciliada.', 'lancar_no_ixc', 'alta'],
      estorno: ['estorno', 'Estorno/devolução no banco sem lançamento no IXC.', 'Identificar o recebimento devolvido e lançar o estorno no IXC.', 'lancar_no_ixc', 'media'],
      'retenção': ['retenção pelo banco', 'Débito de bloqueio/retenção no banco (ex.: judicial) sem lançamento no IXC.', 'Confirmar com o cliente o bloqueio e lançar o débito no IXC na conta correta.', 'verificar_com_cliente', 'alta'],
      'entrada diversa': ['entrada diversa não lançada', 'Entrada que não é recebimento de cliente (ex.: rendimento) sem lançamento no IXC.', 'Lançar como entrada diversa (receita) no IXC.', 'lancar_no_ixc', 'alta'],
      recebimento: ['crédito sem baixa', 'Crédito de cliente no banco sem baixa no IXC (retorno ou webhook não processado).', 'Localizar o título pelo valor/data e dar baixa; verificar processamento do retorno/webhook.', 'lancar_no_ixc', 'media'],
      saida: ['saída sem lançamento', 'Saída no banco (débito, convênio, pagamento) sem lançamento no IXC.', 'Lançar o pagamento no contas a pagar.', 'lancar_no_ixc', 'media']
    };
    payload.so_no_banco.forEach((e) => {
      if (tratadas.has(e.ref)) return;
      const [categoria, causa, proximo_passo, acao_sugerida, certeza] = porClasse[e.classificacao] || porClasse.recebimento;
      itens.push({ refs: [e.ref], categoria, causa, proximo_passo, acao_sugerida, certeza });
    });

    payload.pares_ambiguos.forEach((p) => {
      itens.push({ refs: p.ixc.concat(p.banco), categoria: 'par ambíguo', causa: 'Mais de um lançamento com o mesmo valor e data; o par automático pode estar trocado.',
        proximo_passo: 'Conferir documento/cliente antes de conciliar.', acao_sugerida: 'nenhuma', certeza: 'baixa' });
    });

    const t = payload.totais_calculados_pelo_codigo;
    return {
      resultado: {
        resumo: `[IA simulada] Diferença de ${brl(t.diferenca_ixc_menos_banco)} (IXC − banco). ${itens.length} ponto(s) para revisar, explicados por regras locais.`,
        itens,
        perguntas_ao_cliente: itens.some((i) => i.categoria === 'recebimento manual') ? ['O recebimento manual entrou em dinheiro ou em outra conta bancária?'] : []
      },
      usage: null
    };
  }

  async function conversar() {
    await espera(600);
    return { texto: '[IA simulada] Sem chave da API configurada, não consigo responder perguntas livres. Configure a chave em config.js para conversar com a Lolla.', usage: null };
  }

  return { analisar, conversar };
})();

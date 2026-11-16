/*
 * Privacidade (LGPD): monta o que vai para a IA.
 * Só saem valor, data, documento, IDs e histórico mascarado.
 * Nome do cliente e CPF/CNPJ nunca saem.
 */
Lolla.domain.mascaramento = (function () {
  const PERMITIDAS = new Set(('PIX RECEBIDO RECEBIMENTO CRED CRD CRAD LIQUIDACAO LIQUIDAO COBRANCA COBRANA LOTE TARIFA TITULOS TITULO ESTORNO DEVOLUCAO ' +
    'RENDIMENTO APLIC APLICACAO AUTOMATICA PAGTO PAGAMENTO FORNECEDOR TED DOC TRANSF TRANSFERENCIA BOLETO MANUAL DINHEIRO NO BALCAO ' +
    'CONSULTA LANCAMENTO CRIADO PELA LOLLA SIMULADO JUROS MULTA DEBITO CREDITO LIQUIDACAO').split(' '));

  const semAcento = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Palavra permitida: igual a uma da lista ou com o mesmo começo (tolera "CRÃD.LIQUIDAÃÃO")
  const prefixos = new Set(Array.from(PERMITIDAS).filter((w) => w.length >= 4).map((w) => w.slice(0, 4)));
  const permitida = (limpo) => PERMITIDAS.has(limpo) || limpo.length <= 2 || (limpo.length >= 4 && prefixos.has(limpo.slice(0, 4)));

  function mascararHistorico(texto) {
    let t = String(texto || '');
    // Depois de "PIX RECEBIDO -" vem o nome do pagador: corta tudo
    t = t.replace(/(PIX\s+RECEBIDO)\s*-.*$/i, '$1 - ***');
    t = t.replace(/\d{2,3}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g, '[CNPJ]')   // CNPJ
      .replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, '[CPF]')                // CPF
      .replace(/\S+@\S+/g, '[EMAIL]');
    return t.split(/(\s+|-|\(|\)|\.|\/)/).map((tok) => {
      if (!tok || !/[A-Za-zÀ-ÿ]/.test(tok) || /^\[.*\]$/.test(tok) || tok === '***') return tok;
      if (/\d/.test(tok)) return tok;                                            // NF1234 etc.
      const limpo = semAcento(tok).toUpperCase().replace(/[^A-Z0-9]/g, '');
      return permitida(limpo) ? tok : '***';
    }).join('').replace(/(\*\*\*\s*)+/g, '*** ').trim();
  }

  const reais = (c) => Number((c / 100).toFixed(2));

  function linha(l, prefixo) {
    const o = { ref: prefixo + l.id, data: l.data, valor: reais(l.valor) };
    if (l.documento) o.documento = l.documento;
    if (l.tx_id) o.tx_id = l.tx_id;
    if (l.origem) o.origem_baixa = l.origem;
    if (l.classificacao) o.classificacao = l.classificacao;
    o.historico = mascararHistorico(l.historico);
    return o;
  }

  function montarPayload({ conta, filtros, pareamento, indicadores }) {
    const porTipo = {};
    pareamento.pares.forEach((p) => { porTipo[p.tipo] = (porTipo[p.tipo] || 0) + 1; });
    return {
      banco: conta ? conta.banco : '',
      periodo: { inicio: filtros.dataIni, fim: filtros.dataFim },
      totais_calculados_pelo_codigo: {
        ixc_a_conciliar: reais(indicadores.totalIxc),
        banco_a_conciliar: reais(indicadores.totalBanco),
        diferenca_ixc_menos_banco: reais(indicadores.diferenca)
      },
      diferenca_por_dia: indicadores.porDia.filter((d) => d.dif !== 0).map((d) => ({ data: d.data, ixc_menos_banco: reais(d.dif) })),
      pares_automaticos_por_tipo: porTipo,
      pares_ambiguos: pareamento.pares.filter((p) => p.ambiguo).map((p) => ({ ixc: p.ixc.map((i) => 'M:' + i), banco: p.extrato.map((i) => 'E:' + i) })),
      so_no_ixc: pareamento.soNoIxc.map((l) => linha(l, 'M:')),
      so_no_banco: pareamento.soNoBanco.map((l) => linha(l, 'E:')),
      possiveis_duplicados: pareamento.duplicados.map((d) => ({ documento: d.documento, refs: d.ids.map((i) => 'M:' + i), pendentes: d.pendentes.map((i) => 'M:' + i) }))
    };
  }

  return { mascararHistorico, montarPayload };
})();

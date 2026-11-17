/*
 * Banco: Sicoob (756) — primeiro banco com leitura completa da francesinha.
 * Layout do "Relatório de títulos liquidados" (francesinha) herdado da ferramenta Conciliacao
 * (github.com/EduardoHMoura/Conciliacao), já usada pelo suporte com PDFs reais do Sicoob.
 * As âncoras são trechos do cabeçalho; a coluna é achada pela posição do texto, não pela ordem.
 */
(function (g) {
  g.Lolla.domain.analise.bancos.registrar({
    id: 'sicoob',
    nome: 'Sicoob',
    codigos: ['756'],
    apelidos: ['SICOOB', 'BANCOOB'],
    status: 'completo',
    assinaturas: ['SICOOB', 'BANCOOB', 'SISBR'],
    francesinha: {
      // Ordem e texto do cabeçalho da francesinha Sicoob
      colunas: ['Sacado', 'Nosso', 'Seu', 'Previsao', 'Vencimento', 'Limite', 'Valor', 'Mora', 'Desc', 'Outros', 'Liquid', 'Cobrado'],
      campos: {
        nossoNumero: 'Nosso',        // Nosso Número (com DV após o hífen)
        seuNumero: 'Seu',
        dataCredito: 'Previsao',     // Dt. Previsão de Crédito
        vencimento: 'Vencimento',
        valorTitulo: 'Valor',        // valor original do título
        mora: 'Mora',
        desconto: 'Desc',
        outros: 'Outros',
        dataPagamento: 'Liquid',     // Dt. Liquidação
        valorPago: 'Cobrado',        // Vlr. Cobrado
        tarifa: null                 // a francesinha Sicoob não traz a tarifa por título
      },
      // Nunca extraído: a coluna Sacado (nome do pagador) só aparece na linha original, que não sai do navegador
      colunasPessoais: ['Sacado']
    },
    credito: { modo: 'auto', toleranciaDias: 2, tarifa: 'desconhecida' },
    regrasOfx: [
      { categoria: 'recebimento', subtipo: 'cobrança', padrao: /\bCR\w{0,2}D\w* ?LIQ\w* ?COB|\bLIQ\w* COBR|CRED COBRANCA/ },
      { categoria: 'tarifa', padrao: /\bDEB\w* ?TAR|\bTAR\w* ?COB/ },
      { categoria: 'recebimento', subtipo: 'pix', padrao: /\bCRED\w* PIX|\bPIX RECEB|\bRECEBIMENTO PIX/ }
    ],
    pendencias: [
      'Confirmar com amostra real se o crédito da cobrança vem em lote diário ou por título (hoje: tenta os dois)',
      'Confirmar se a tarifa vem descontada do crédito ou em débito separado (hoje: tenta as duas)'
    ]
  });
})(typeof self !== 'undefined' ? self : globalThis);

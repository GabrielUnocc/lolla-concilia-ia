/*
 * Banco: Banco do Brasil (001) — estrutura pronta, leitor da francesinha PENDENTE.
 * Para ativar: preencher francesinha.colunas/campos a partir de uma amostra mascarada,
 * confirmar a regra de crédito e as descrições do extrato, e mudar status para 'completo'.
 * Enquanto isso, OFX e relatório do IXC são lidos normalmente e a etapa C (OFX × IXC) funciona.
 */
(function (g) {
  g.Lolla.domain.analise.bancos.registrar({
    id: 'bb',
    nome: 'Banco do Brasil',
    codigos: ['001'],
    apelidos: ['BANCO DO BRASIL', 'BB'],
    status: 'pendente',
    assinaturas: ['BANCO DO BRASIL', 'BB COBRANCA'],
    francesinha: null,
    credito: { modo: 'auto', toleranciaDias: 2, tarifa: 'desconhecida' },
    regrasOfx: [],
    pendencias: [
      'Amostra mascarada da francesinha (PDF com texto) para mapear as colunas',
      'Confirmar se o crédito da cobrança vem em lote ou por título e como a tarifa aparece no extrato',
      'Exemplos de descrições do OFX (issue #7)'
    ]
  });
})(typeof self !== 'undefined' ? self : globalThis);

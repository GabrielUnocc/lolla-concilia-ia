/*
 * Configuração local da AR Lolla (equivale ao .env neste projeto sem build).
 *
 * 1. Copie este arquivo para config.js (já existe um config.js vazio no pacote).
 * 2. Preencha claude.apiKey com a sua chave.
 *
 * ATENÇÃO: a chave fica visível no navegador. Use só em ambiente local e controlado.
 * Nunca publique esta aplicação nem versione o config.js com a chave.
 */
window.LOLLA_CONFIG = {
  claude: {
    apiKey: '',                       // chave da API do Claude (uso local)
    model: 'claude-sonnet-5-5',       // alternativas: 'claude-haiku-5-5', 'claude-opus-5-5'
    baseUrl: 'https://api.anthropic.com',
    maxTokens: 2000,
    // 'navegador-direto' = chave no cliente (MVP).
    // 'intermediario'    = futuro: baseUrl aponta para um intermediário que guarda a chave.
    autenticacao: 'navegador-direto'
  },
  ixc: {
    modo: 'simulado',                 // futuro: 'real'
    latenciaMinMs: 300,
    latenciaMaxMs: 1200,
    taxaErro: 0.05                    // 5% das consultas falham (simulação)
  },
  custo: {
    dolarEmReais: 5.5,
    // US$ por milhão de tokens (entrada / saída) do modelo configurado
    precoEntradaUsd: 2,
    precoSaidaUsd: 10
  }
};

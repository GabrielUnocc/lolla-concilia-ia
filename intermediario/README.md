# Intermediário local da IA (Modo Análise)

Servidor Node pequeno, sem dependências, que fica entre o navegador e a API do Claude.

- **Guarda a chave** (só aqui; nunca vai para o navegador, para o `localStorage` nem para o Git).
- **Só aceita "interpretar divergências"** com dados já mascarados. Confere de novo se há CPF, CNPJ, e-mail, telefone ou campos proibidos.
- **Controla o custo**: estimativa antes, limite por análise e por dia, custo real depois. O registro de uso (`dados/uso.json` e `dados/uso.log`) tem só data, modelo, tokens e custo, sem conteúdo.
- **Serve a página** do Modo Análise em http://127.0.0.1:8787/analise.html.

## Rodar

```bash
cp intermediario/.env.example intermediario/.env   # preencha ANTHROPIC_API_KEY
npm run intermediario
```

Sem chave, a página funciona normalmente (leitura, cruzamento, CSV, chamado) e a etapa de IA mostra "IA indisponível". Nenhuma resposta é simulada.

| Variável | Padrão | Para quê |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Chave da API (obrigatória para a IA) |
| `LOLLA_PORTA` / `LOLLA_HOST` | 8787 / 127.0.0.1 | Só escuta neste computador |
| `LOLLA_LIMITE_ANALISE_REAIS` | 1,00 | Gasto máximo por análise |
| `LOLLA_LIMITE_DIA_REAIS` | 10,00 | Gasto máximo por dia |
| `LOLLA_DOLAR` | 5,50 | Conversão do custo |
| `LOLLA_MAX_TOKENS_SAIDA` | 4000 | Teto de saída por consulta (entra na estimativa máxima) |
| `LOLLA_MODELOS` | Haiku (padrão), Sonnet, Opus desligado | JSON com `id`, `nome`, `entrada`, `saida` (US$/milhão), `padrao`, `habilitado` |
| `LOLLA_OPUS` | — | `1` libera o Opus |
| `LOLLA_ORIGENS` | `null`, `http://127.0.0.1:*`, `http://localhost:*`, `chrome-extension://*` | Quem pode chamar |

Os preços padrão são os de `docs/requisitos/07-custo-da-ia.md`. **Confira na tabela oficial da Anthropic antes de usar.**

## Contrato (para a TI substituir este intermediário)

`GET /v1/status` → `{ disponivel, motivo, modelos[{id, nome, entradaUsdMtok, saidaUsdMtok, padrao, habilitado}], dolar, limites{porAnalise, porDia, gastoHoje, saldoHoje}, tokensPrompt, caracteresPorToken, maxTokensSaida }`

`POST /v1/interpretar` com `{ modelo, analiseId, payload: { contexto, parte, itens[{id, linhas[]}] } }` →
`200 { resultado{itens[{id, causa_provavel, linhas, explicacao, proximo_passo, certeza, pergunta_ao_cliente}], observacoes_gerais}, usage{tokensEntrada, tokensSaida}, custoReais, estimativaReais, gastoHoje, saldoHoje, gastoAnalise, truncado }`.
Erros: `400` modelo/análise, `402` limite (com `motivo`), `422` dado pessoal, `503` sem chave, `502` API.

O prompt fica em `prompt.mjs`. No navegador, só o endereço muda (campo "Endereço do intermediário" na etapa 5).

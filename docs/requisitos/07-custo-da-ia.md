# 07. Custo da IA

[← Voltar ao índice](README.md)

## Por consulta

Consulta de ~10 mil tokens de entrada e ~2 mil de saída.

| Modelo | Custo por consulta |
|---|---|
| Sonnet 5.5 (recomendado) | ~R$ 0,22 |
| Opus 5.5 | ~R$ 0,44 |
| Haiku 5.5 | ~R$ 0,01 |

- Preços da API por milhão de tokens (entrada/saída): Sonnet US$ 2/US$ 10, Opus US$ 4/US$ 20, Haiku US$ 0,10/US$ 0,50.
- Dólar a R$ 5,50, com margem.

## Por ano

- **Premissa:** 3 consultas por chamado, ou seja ~R$ 0,66 por chamado.
- Com 328 chamados/mês: **~R$ 2.600/ano**.

## Sugestão

Testar com o Sonnet e trocar para o Haiku se ele acertar igual nos testes. O cache do manual reduz ainda mais o custo.

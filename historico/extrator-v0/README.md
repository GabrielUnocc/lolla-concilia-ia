# Extrator v0 (histórico)

Primeira versão do código que lê as duas grades da Conciliação Manual pelo atributo `abbr` e faz o pareamento (identificador, valor + data, lote, duplicados).

- `extrator.js`: extrator + pareamento, num arquivo só.
- [`testes/`](testes/): teste de viabilidade com a amostra mascarada e um cenário fictício, e o resultado.

O código foi portado para [`extensao/lolla/conteudo/leitor.js`](../../extensao/lolla/conteudo/leitor.js) e [`extensao/lolla/lib/pareamento.js`](../../extensao/lolla/lib/pareamento.js) (igual em `mvp/js/domain/`).

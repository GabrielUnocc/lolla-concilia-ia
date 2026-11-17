# 05. Requisitos técnicos

[← Voltar ao índice](README.md)

| Requisito | Status |
|---|---|
| Ler as grades pelo atributo `abbr`, não pela posição da coluna | Feito em [`historico/extrator-v0/extrator.js`](../../historico/extrator-v0/extrator.js), hoje em [`extensao/lolla/conteudo/leitor.js`](../../extensao/lolla/conteudo/leitor.js) |
| Converter valores e datas no formato brasileiro (`1.234,56`, `02/11/2026`) | Feito em [`historico/extrator-v0/extrator.js`](../../historico/extrator-v0/extrator.js), hoje em [`extensao/lolla/conteudo/leitor.js`](../../extensao/lolla/conteudo/leitor.js) |
| Reconhecer descrições com caracteres quebrados do OFX (ex.: `CRÃD.LIQUIDAÃÃO`), casando por trecho | Feito no Modo Análise ([`normalizacao.js`](../../mvp/js/domain/analise/normalizacao.js) e [`classificacaoOfx.js`](../../mvp/js/domain/analise/classificacaoOfx.js)); falta levar ao painel da extensão |
| Para banco fora da tabela de descrições: perguntar ao suporte e guardar como regra nova | A fazer |
| Ler a aba Filtros, para pegar conta e período | A fazer |
| Ler a aba de conciliação de documento, para o ID do boleto nos recebimentos manuais | **A confirmar** |
| Avisar sobre mais de uma conciliação na mesma conta | A fazer (provavelmente aviso manual) |
| Limitar a busca de lote (combinações de valores) por quantidade de itens e janela de datas | Parcial: limite de 18 itens e janela de 1 dia |

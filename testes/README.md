# Testes de viabilidade: extrator e pareamento

Primeiro teste prático da ideia descrita no README principal: **ler as duas grades da Conciliação Manual do IXC e casar automaticamente o que é óbvio**, deixando para a IA só as sobras.

Resultado: **viável**. O extrator lê o HTML real do IXC sem depender da posição das colunas, e o pareamento em código resolveu todos os cenários do teste fictício.

## O que foi analisado

### 1. Estrutura das amostras (`docs/amostras-ixc/`)

| Arquivo | Conteúdo | Linhas capturadas |
|---|---|---|
| `esquerdo.html` | Movimentação Financeira, `TABLE#grid_lancamentos_aba_3` | 1 |
| `direito.html` | Extrato Bancário (OFX), `TABLE#grid_lancamentos_OFX_3` | 0 (sem `<tbody>`) |
| `totais.html` | Rodapé `SECTION#rodape_aba_3` com totais e diferença | - |
| `filtros.html` | Filtros da aba (conta, período) | - |

O que foi confirmado:

- Cada célula de dado tem `abbr` com o nome do campo (`fn_movim_finan.*` / `fn_extrato.*`): dá para ler pelo nome do campo, e não pela posição.
- O cabeçalho fica numa tabela separada (flexigrid), então a tabela de dados é lida direto pelo `tbody`.
- Status "Conc." vem só de um ícone: `fa-times` = não conciliado.
- Valores em formato brasileiro (`1.250,50`) e datas `dd/mm/aaaa`.
- A captura do lado direito estava vazia, então **ainda falta uma amostra real com extrato preenchido** para confirmar que as células do OFX vêm no mesmo formato.

### 2. Extrator (`extensao/extrator.js`)

Base do content script da futura extensão. Expõe `window.ConciliaIA`:

- `extrairGrade(seletor, prefixo)`: lê uma grade e devolve uma lista de lançamentos `{ id, conciliado, data, documento, tx_id, credito, debito, historico, valor }`.
- `extrairTela()`: lê as duas grades da tela de uma vez.
- `parear(ixc, extrato)`: faz o pareamento automático (abaixo).

Decisões:

- **Valores em centavos (inteiro)** no campo `valor` (entrada positiva, saída negativa). Evita erro de arredondamento nas somas.
- **Toda soma e comparação fica no código**, nunca na IA, como previsto no README principal.

### 3. Pareamento automático

Ordem das regras (cada linha só entra em um par):

1. **Por identificador**: mesmo valor e mesmo `tx_id` ou `documento`.
2. **Por valor + data**: mesmo valor, banco no mesmo dia ou D+1.
3. **Lote**: um crédito do banco igual à soma de 2 ou mais recebimentos do IXC (mesmo dia ou dia anterior). Testa as combinações possíveis, limitado a 18 candidatos por crédito.
4. **Possíveis duplicados**: mesmo documento aparecendo mais de uma vez no IXC (verifica a lista inteira, inclusive o que já foi pareado).

Saída: `pares`, `so_no_ixc`, `so_no_banco`, `possiveis_duplicados`. As sobras são o que seria enviado para a IA.

## Resultados

### Amostra real mascarada

| Verificação | Resultado |
|---|---|
| Linhas lidas | IXC 1, extrato 0 |
| Campos da linha | ID 131377, 02/11/2026, doc. 7178351, R$ 60,00, não conciliado |
| Pareamento | Nada a parear (extrato vazio); a linha vai para "só no IXC" |

### Cenário fictício (`testes/cenario_ficticio.html`)

Mesmo HTML do IXC, com dados inventados:

| IXC | Data | Doc. | Valor | | Banco | Data | Doc. | Valor | Histórico |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 02/11 | 7178351 | 60,00 | | a | 02/11 | 7178351 | 60,00 | CRED COBRANCA |
| 2 | 02/11 | 7178352 | 1.250,50 | | b | 03/11 | | 1.250,50 | PIX RECEBIDO |
| 3 | 03/11 | 7178360 | 100,00 | | c | 04/11 | | 180,00 | CRED LOTE |
| 4 | 03/11 | 7178361 | 80,00 | | d | 05/11 | 7178370 | 45,00 | CRED COBRANCA |
| 5 | 04/11 | 7178370 | 45,00 | | e | 05/11 | | -3,50 | TARIFA |
| 6 | 04/11 | 7178370 | 45,00 | | f | 06/11 | | 99,90 | PIX SEM BAIXA |
| 7 | 05/11 | 7178399 | 30,00 | | | | | | |

| Esperado | Encontrado |
|---|---|
| Par por documento | 1 = a, 5 = d |
| Par por valor + D+1 | 2 = b |
| Lote | 3 + 4 = c (100 + 80 = 180) |
| Duplicado | documento 7178370 nos IDs 5 e 6 |
| Só no IXC | 6 (duplicado), 7 (sem crédito no banco) |
| Só no banco | e (tarifa), f (PIX sem baixa no IXC) |

**10 de 10 verificações passaram.**

### Problemas encontrados durante o teste (já corrigidos)

- **Lote não era encontrado**: a primeira versão somava *todos* os recebimentos próximos da data (100 + 80 + 45 = 225 ≠ 180). Passou a testar combinações (subconjuntos).
- **Duplicado não era apontado**: a primeira versão procurava duplicados só nas sobras; como o ID 5 já tinha sido pareado, o 6 ficava sozinho. Passou a olhar a lista inteira.

Os dois protótipos em `prototipo/` também foram abertos no navegador headless: **nenhum erro no console**.

## Limitações e pontos de atenção

- **Extrato real ainda não testado**: a amostra do lado direito veio vazia.
- **Lote com mais de 18 recebimentos candidatos**: o limite evita travar o navegador; para volumes grandes vai precisar de outra estratégia (por exemplo agrupar por convênio/carteira ou usar a data de crédito do retorno).
- **Pares ambíguos**: com vários lançamentos de mesmo valor e data, o pareamento pega o primeiro que encontrar. Deveria marcar como "ambíguo" e mandar para revisão/IA.
- **Tarifas e estornos**: hoje só aparecem como sobra. Dá para criar regra própria pelo histórico (`TARIFA`, `ESTORNO`).
- **D+1 fixo**: pode precisar de D+2 ou mais conforme o banco e fins de semana/feriados.
- **IA não testada**: depende da chave de API da empresa e da verificação da política de dados.

## Próximos passos sugeridos

1. Capturar uma conciliação real **que não fecha**, com as duas grades preenchidas (mascarada), e rodar o extrator nela.
2. Transformar `extensao/extrator.js` em extensão (manifest + botão "Analisar").
3. Tratar pares ambíguos, tarifas e estornos.
4. Montar o envio das sobras para a IA (só valor, data, documento, IDs e histórico mascarado).

## Como rodar

```
npm i playwright
npx playwright install chromium
node testes/rodar_testes.js
```

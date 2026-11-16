# 03. Como a ferramenta funciona

[← Voltar ao índice](README.md)

A ferramenta segue o procedimento interno de conciliação, analisando **um dia por vez**, na ordem **saídas → entradas diversas → recebimentos**.

## Divisão do trabalho

| Etapa do procedimento | Quem faz |
|---|---|
| 1. Análises iniciais (período do OFX, data atual, filtros) | Código, com alertas |
| Regra base: mesmo dia, mesmo valor e mesma natureza | Código |
| 2. Saídas: só no IXC, só no banco, nos dois | Código |
| 3. Classificação: recebimento × entrada diversa, pela descrição do banco | Código |
| 4. Recebimentos: diferença e boletos com o valor exato dela | Código |
| 4/5. Causa provável (recebimento manual, data de crédito, retenção pelo banco, entrada lançada como recebimento) | **IA** |
| 6. Comparação por PROCV com a francesinha | Ferramenta da francesinha já existente |
| 7. Validação final e conciliação | **Suporte** |

## Como a IA analisa

**Entrada:**

1. Dados que não fecharam, já organizados pelo código. A IA não faz contas.
2. O procedimento interno de conciliação, como manual.
3. Exemplos de casos resolvidos.

**Saída**, sempre no mesmo formato:

- causa provável;
- linhas envolvidas;
- próximo passo, com o documento ou vídeo certo;
- grau de certeza (alto, médio ou baixo).

Se faltar informação que só o cliente tem, a IA pergunta em vez de chutar.

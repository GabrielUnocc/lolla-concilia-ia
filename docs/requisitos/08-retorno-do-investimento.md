# 08. Retorno do investimento

[← Voltar ao índice](README.md)

Cálculo considerando **só o uso interno**.

## Custo da hora

R$ 2.600 ÷ 220 × **1,8** (encargos, **premissa**) = **R$ 21,27/h**

## Custo atual do tempo do time

328 chamados × **40 min** (**premissa**) × R$ 21,27 × 12 = **R$ 55.812/ano**

## Economia

| Redução no tempo | Economia líquida/ano (já descontada a IA) |
|---|---|
| 30% | ~R$ 14.100 |
| 50% | ~R$ 25.300 |
| 70% | ~R$ 36.500 |

- Como ferramenta interna, os clientes continuam abrindo chamado, então não entra economia nas aberturas.
- A economia é tempo liberado, não dinheiro que sai do caixa: são **~109 h/mês** no cenário de 50%.
- O maior ganho está em cortar as idas e vindas: resolver em horas, não em 2 dias.

## Fórmulas

- Custo atual = chamados × horas por chamado × custo da hora × 12
- Custo com IA = custo atual × (1 − % de redução) + chamados × consultas × custo por consulta × 12
- Economia = custo atual − custo com IA

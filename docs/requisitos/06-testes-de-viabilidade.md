# 06. Testes de viabilidade

[← Voltar ao índice](README.md)

Os testes **1 a 3 decidem o projeto** e não dependem da TI. O teste 6 pode começar colando o resumo no Claude antes de a API estar liberada.

| # | Teste | Passa se | Status |
|---|---|---|---|
| 1 | Ler as duas grades (script no console) | O JSON bate com o rodapé de totais | Parcial: passou na amostra mascarada e no cenário fictício; falta conciliação real |
| 2 | Ler a aba Filtros | Pega conta e período certos | Pendente |
| 3 | Classificar descrições reais de OFX | Separa recebimento × entrada diversa mesmo com os caracteres quebrados | Pendente |
| 4 | Fluxo dia a dia em código, com casos resolvidos | Isola a mesma diferença que o suporte encontrou | Pendente |
| 5 | Acessar a aba de conciliação de documento | Obtém o ID do boleto | Pendente |
| 6 | IA com sobras + manual + exemplos | Acerta causa e etapa nos casos conhecidos | Pendente |

Detalhes do que já foi testado: [resultado do primeiro teste](../../testes/README.md).

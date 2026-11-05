# Conciliação bancária com IA (IXC Provedor)

Ferramenta de apoio ao suporte para diagnosticar divergências na conciliação bancária do IXC Provedor: o que está no sistema (movimentação financeira) contra o que veio no extrato do banco (OFX).

Status: ideia validada com protótipo visual. Ainda sem extrator real nem IA conectada.

## Problema

Na conciliação bancária, os dois lados precisam fechar (entradas e saídas do IXC iguais às do banco). Quando não fecham, o suporte precisa descobrir o motivo, por exemplo:

- Pagamento que está no banco e não veio para o IXC (precisa de baixa manual).
- Pagamento a mais no IXC, sem crédito no banco.
- Recebimento duplicado para o mesmo boleto.
- Crédito em lote no banco que corresponde à soma de vários recebimentos no IXC.
- Tarifas, estornos e diferenças de data (D+1).

Há cenários novos o tempo todo, por isso a ideia de usar IA com contexto, e não só regras fixas.

## Ideia

Modelo híbrido, em que a IA nunca concilia sozinha:

1. **Extração (código):** uma extensão de navegador lê as duas grades da tela de conciliação do IXC (não existe rota de API para suporte).
2. **Pareamento automático (código):** casa o que é óbvio por valor, data e documento/ID da transação. Todas as somas e comparações ficam no código, nunca no modelo.
3. **Análise (IA):** recebe só o que sobrou (só no IXC, só no banco, possíveis duplicados), junto com o contexto de cada campo, e sugere a causa provável e o par mais provável.
4. **Aprovação (humano):** o suporte confere a sugestão, seleciona as linhas e concilia.

## Estrutura da tela do IXC (Conciliação Manual)

Detalhes em `docs/amostras-ixc/`.

| Parte | Elemento |
| --- | --- |
| Movimentação Financeira (IXC) | `TABLE#grid_lancamentos_aba_3` |
| Extrato Bancário (OFX) | `TABLE#grid_lancamentos_OFX_3` |
| Rodapé de totais | `SECTION#rodape_aba_3` |
| Filtros | `DIV#box_search_tab_3` |

- As células têm o atributo `abbr` com o nome do campo (`fn_movim_finan.*` no IXC, `fn_extrato.*` no extrato). Campos: id, conciliado, data, documento, tx_id, credito, debito, historico.
- Ler pelo `abbr`, e não pela posição da coluna.
- As grades não usam paginação nem carregam ao rolar (`usepager:false`, `url:false`).
- A coluna "Conc." é um ícone (`fa-times` para não conciliado), então o status vem da classe.
- Valores em formato brasileiro (`60,00`, `02/11/2026`).
- Totais: `#total_selecionado_aba3_mov`, `#total_a_conciliar_aba3_mov`, `#diferenca_aba3`, `#total_selecionado_aba3_ext`, `#total_a_conciliar_aba3_ext`.
- `Diferença` = total a conciliar (IXC) menos total a conciliar (extrato).

## Protótipo

`prototipo/conciliacao_ia_simulacao.html`: abra no navegador. Simulação com dados fictícios, no estilo do IXC, com seleção de linhas (verde quando os valores batem, laranja quando não), botão Conciliar, totais e painel de análise da IA com quatro cenários: lote, duplicado, só no banco e só no IXC.

## Próximos passos

- [ ] Capturar um caso real (HTML das grades preenchidas, mascarado) de uma conciliação que não fecha.
- [ ] Extensão de navegador que extrai as duas grades para JSON.
- [ ] Pareamento automático em código (valor, data, documento, tx_id, soma em lote).
- [ ] Integração com a IA para as divergências restantes.
- [ ] Regras aprendidas a partir das correções do suporte.
- [ ] Ler também a aba Filtros (conta e período) para dar contexto à IA.

## Privacidade

Os dados são financeiros e de clientes. Antes de usar com dados reais:

- Verificar a política da empresa sobre enviar dados a serviços de IA.
- Mascarar nomes, CPF/CNPJ e dados pessoais. Enviar só valor, data, documento e IDs.
- As amostras em `docs/amostras-ixc/` já estão mascaradas. Não versionar capturas reais sem mascarar.

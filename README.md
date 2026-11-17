# Conciliação bancária com IA (IXC Provedor)

Ferramenta de apoio ao suporte para diagnosticar divergências na conciliação bancária do IXC Provedor: o que está no sistema (movimentação financeira) contra o que veio no extrato do banco (OFX).

Projeto **AR Lolla** (Agente Lolla). Status em 16/11/2026: extensão do Chrome na versão 0.3, testada no IXC simulado e na página de teste. Ainda falta o teste numa conciliação real (base de teste, mascarada) e a liberação da empresa para usar a IA com dados reais.

## Por onde começar

| Quero... | Vá em |
|---|---|
| Instalar e testar a extensão no IXC | [`extensao/lolla/`](extensao/lolla/) — leia o README da pasta |
| Testar sem o IXC, com dados fictícios | [`mvp/`](mvp/) (app completa no navegador) ou [`extensao/lolla/teste/`](extensao/lolla/teste/) |
| Cadastrar o Contexto da IA (regras de banco, casos resolvidos) | `npm start` e aba **Contexto da IA** do MVP: veja "Servidor local" abaixo |
| Entender o projeto, custos e retorno | [`docs/requisitos/`](docs/requisitos/) |
| Ver como a tela do IXC é montada | [`docs/amostras-ixc/`](docs/amostras-ixc/) |

## Mapa do repositório

```
README.md            este arquivo
docs/
  requisitos/        análise de requisitos (01 a 09): objetivo, números, arquitetura, testes, custo, retorno, pendências
  amostras-ixc/      HTML mascarado da tela de Conciliação Manual do IXC
extensao/
  lolla/             EXTENSÃO DO CHROME (versão atual, 0.3) — o produto
mvp/                 app web com IXC simulado, IA (ou IA simulada), indicadores, importação de OFX e Contexto da IA
servidor/            servidor local (npm start): abre o MVP e guarda o Contexto da IA usado pelo MVP e pela extensão
package.json         npm start / npm test do servidor
historico/           primeiras versões, só para consulta (não usar)
  prototipo/         protótipo visual com 4 cenários fictícios
  extrator-v0/       primeiro extrator + pareamento e seus testes automáticos
```

| Pasta | Situação | O que é |
|---|---|---|
| [`extensao/lolla/`](extensao/lolla/) | **Em uso** | Extensão MV3: lê as grades do IXC, confere com o rodapé, pareia em código, analisa as sobras com a IA, visual modernizado e painel em guia |
| [`mvp/`](mvp/) | **Em uso** | Mesma lógica rodando sozinha no navegador, para testar cenários sem o IXC |
| [`servidor/`](servidor/) | **Em uso** | Servidor local sem dependências: serve o MVP e guarda o Contexto da IA (uma lista só para o MVP e a extensão) |
| [`docs/requisitos/`](docs/requisitos/) | **Em uso** | Documentação do projeto |
| [`docs/amostras-ixc/`](docs/amostras-ixc/) | Referência | Base para o leitor da extensão |
| [`historico/`](historico/) | Arquivado | Versões que deram origem às de cima |

O pareamento, o mascaramento e os prompts são os mesmos no `mvp/js/` e no `extensao/lolla/lib/`. Ao alterar um, copie para o outro.

## Servidor local e Contexto da IA

Precisa de Node 22 ou mais novo (sem dependências para instalar).

```bash
npm start      # http://127.0.0.1:3000 → abre o MVP; a aba Contexto da IA usa este servidor
npm test       # testes do servidor
```

- **Contextos iniciais:** na primeira vez, o servidor carrega os 8 contextos de `servidor/contextos-iniciais.json` (campos da tela do IXC, liquidação em lote, PIX de terceiros, OFX com acentos quebrados, francesinha, datas, tarifas e como responder). Depois disso vale a lista salva.
- **Contexto da IA:** textos que o suporte cadastra (regras de um banco, padrões de histórico, casos já resolvidos). Vão junto com as sobras em toda análise, no MVP e na extensão, e o resultado mostra quais foram enviados.
- A lista é uma só: fica em `servidor/dados/contextos.json` (fora do Git). Na extensão, informe o endereço do servidor em **Configurações → 3. Contexto da IA**.
- Limites: 20 contextos, 4.000 caracteres cada e 20.000 no total (cerca de 5 mil tokens por análise). O servidor recusa texto vazio e texto com CPF, CNPJ ou e-mail.
- O servidor só escuta em `127.0.0.1` e só aceita chamadas do próprio MVP e de extensões do Chrome. Variáveis opcionais: `PORT`, `HOST` e `ARQUIVO_CONTEXTOS`.
- Sem o servidor, o MVP ainda abre pelo arquivo (duplo clique no `index.html`) e a extensão funciona: só a análise sai sem o Contexto da IA, com um aviso.

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

## Próximos passos

Lista completa e responsáveis em [`docs/requisitos/09-pendencias-e-proximos-passos.md`](docs/requisitos/09-pendencias-e-proximos-passos.md).

## Privacidade

Os dados são financeiros e de clientes. Antes de usar com dados reais:

- Verificar a política da empresa sobre enviar dados a serviços de IA.
- Mascarar nomes, CPF/CNPJ e dados pessoais. Enviar só valor, data, documento e IDs.
- As amostras em `docs/amostras-ixc/` já estão mascaradas. Não versionar capturas reais sem mascarar.

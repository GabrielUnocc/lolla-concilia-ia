# Conciliação bancária com IA (IXC Provedor)

Ferramenta de apoio ao suporte para diagnosticar divergências na conciliação bancária do IXC Provedor: o que está no sistema (movimentação financeira) contra o que veio no extrato do banco (OFX).

Projeto **AR Lolla** (Agente Lolla). Status em 16/11/2026: extensão do Chrome na versão 0.3, testada no IXC simulado e na página de teste, e aplicação web com login (pasta `app/`) com lista de conciliações, importação do JSON do IXC e da francesinha e a tela de Conciliação Manual no estilo do IXC. Ainda falta o teste numa conciliação real (base de teste, mascarada) e a liberação da empresa para usar a IA com dados reais.

## Por onde começar

| Quero... | Vá em |
|---|---|
| Instalar e testar a extensão no IXC | [`extensao/lolla/`](extensao/lolla/): leia o README da pasta |
| Rodar a aplicação web com login (equipe) | [`app/`](app/): veja "Como rodar" abaixo |
| Testar sem o IXC, com dados fictícios | [`mvp/`](mvp/) (app completa no navegador) ou [`extensao/lolla/teste/`](extensao/lolla/teste/) |
| Entender o projeto, custos e retorno | [`docs/requisitos/`](docs/requisitos/) |
| Ver como a tela do IXC é montada | [`docs/amostras-ixc/`](docs/amostras-ixc/) |

## Mapa do repositório

```
README.md            este arquivo
package.json         scripts da aplicação web (npm start, npm test, criar-usuario)
app/                 aplicação web com login, lista de conciliações e Conciliação Manual
docs/
  requisitos/        análise de requisitos (01 a 09): objetivo, números, arquitetura, testes, custo, retorno, pendências
  amostras-ixc/      HTML mascarado da tela de Conciliação Manual do IXC
extensao/
  lolla/             EXTENSÃO DO CHROME (versão atual, 0.3): o produto
mvp/                 app web com IXC simulado, IA (ou IA simulada), indicadores e importação de OFX
historico/           primeiras versões, só para consulta (não usar)
  prototipo/         protótipo visual com 4 cenários fictícios
  extrator-v0/       primeiro extrator + pareamento e seus testes automáticos
```

| Pasta | Situação | O que é |
|---|---|---|
| [`extensao/lolla/`](extensao/lolla/) | **Em uso** | Extensão MV3: lê as grades do IXC, confere com o rodapé, pareia em código, analisa as sobras com a IA, visual modernizado e painel em guia |
| [`app/`](app/) | **Em uso** | Aplicação web Node (SQLite nativo) com login, importação do JSON do IXC e da francesinha |
| [`mvp/`](mvp/) | **Em uso** | Mesma lógica rodando sozinha no navegador, para testar cenários sem o IXC |
| [`docs/requisitos/`](docs/requisitos/) | **Em uso** | Documentação do projeto |
| [`docs/amostras-ixc/`](docs/amostras-ixc/) | Referência | Base para o leitor da extensão |
| [`historico/`](historico/) | Arquivado | Versões que deram origem às de cima |

O pareamento, o mascaramento e os prompts são os mesmos no `mvp/js/` e no `extensao/lolla/lib/`. Ao alterar um, copie para o outro.

## Como rodar a aplicação web (`app/`)

Precisa de Node 22.13 ou mais novo (usa o SQLite nativo do Node, sem dependências para instalar).

```bash
npm run criar-usuario -- voce@empresa.com "Seu Nome"   # pede a senha no terminal
npm start                                              # http://127.0.0.1:3000
npm test
```

- Não há cadastro aberto: cada acesso é criado por quem administra, porque a análise com IA vai consumir tokens da conta da equipe. Para desativar: `npm run criar-usuario -- voce@empresa.com --desativar`.
- Banco e francesinhas ficam em `data/` (fora do git). Variáveis opcionais: `PORT`, `HOST`, `DATA_DIR`, `SESSAO_HORAS` (padrão 12) e `COOKIE_SEGURO=1` (use atrás de HTTPS).
- Para testar sem o IXC, use o botão "Baixar JSON de exemplo" na tela Nova conciliação.

### Telas

| Tela | O que faz |
| --- | --- |
| `/login.html` | E-mail e senha. Sessão em cookie HttpOnly, senha com scrypt e limite de tentativas por IP. |
| `/` | Lista de conciliações da equipe, com situação, pendências, diferença e autor. |
| `/nova.html` | Envio do JSON extraído do IXC (validado na hora, com prévia dos totais), conta, período, observação e francesinha opcional (PDF, CSV, TXT, RET, XLS, XLSX ou OFX, até 10 MB). |
| `/conciliacao.html?id=N` | Tela no estilo do IXC: abas Filtros, Conciliação Manual, Ajustes e Todos os conciliados. Seleção verde/laranja, botão Conciliar e totais. Na Conciliação Manual dá para criar movimentações no lado do IXC e excluir linhas dos dois lados; tudo fica listado em Ajustes e pode ser desfeito. As linhas que já vieram conciliadas do IXC aparecem em Todos os conciliados. Vínculos e ajustes ficam salvos aqui para o diagnóstico; para valer, repita no IXC. |

### Formato do JSON

São aceitos dois formatos:

1. **O da extensão "Leitor de Conciliacao IXC"**, que tem `grid_esquerda_ixc`, `grid_direita_extrato`, `resumo_valores` e `totais_rodape`. As linhas `agrupador_data` (subtotal do dia) são ignoradas. A conta e o período vêm de `resumo_valores`, e o lote e o arquivo OFX aparecem na aba Filtros.
2. **O formato simples abaixo.** Há um exemplo completo em `app/public/exemplos/conciliacao-exemplo.json`.

```json
{
  "versao": 1,
  "capturado_em": "2026-11-04T10:15:00-03:00",
  "filtros": { "conta": "Sicoob 0001", "data_inicial": "01/11/2026", "data_final": "03/11/2026" },
  "totais": { "total_a_conciliar_aba3_mov": "600,00", "total_a_conciliar_aba3_ext": "505,00", "diferenca_aba3": "95,00" },
  "movimentacao": [
    { "id": "131377", "conciliado": false, "data": "02/11/2026", "documento": "7178351", "tx_id": "", "credito": "60,00", "debito": "0,00", "historico": "Rec. ... doc.: 7178351" }
  ],
  "extrato": [ { "id": "905", "conciliado": false, "data": "02/11/2026", "documento": "", "tx_id": "L0001", "credito": "300,00", "debito": "0,00", "historico": "LIQUIDACAO COBRANCA LOTE" } ]
}
```

- Os campos também podem vir com o prefixo do `abbr` (`fn_movim_finan.credito`, `fn_extrato.data`).
- Valores aceitam `1.234,56`, `60,00` ou número. Datas aceitam `dd/mm/aaaa` ou `aaaa-mm-dd`.
- `filtros` preenche conta e período automaticamente. `totais` é conferido contra as linhas: se não bater, aparece um aviso de extração incompleta.
- Linhas fora do período informado também geram aviso.

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

Aplicação web (`app/`):

- [x] Login com e-mail e senha, e lista de conciliações.
- [x] Importação do JSON do IXC, período, conta e francesinha.
- [x] Tela de Conciliação Manual no estilo do IXC, com vínculos salvos.
- [ ] Ler o conteúdo da francesinha (hoje ela só é guardada e baixada).
- [ ] Controle de consumo de tokens por usuário quando a IA for conectada.
- [ ] Usar o pareamento e a IA da extensão (`extensao/lolla/lib/`) também na aplicação web.

## Privacidade

Os dados são financeiros e de clientes. Antes de usar com dados reais:

- Verificar a política da empresa sobre enviar dados a serviços de IA.
- Mascarar nomes, CPF/CNPJ e dados pessoais. Enviar só valor, data, documento e IDs.
- As amostras em `docs/amostras-ixc/` já estão mascaradas. Não versionar capturas reais sem mascarar.
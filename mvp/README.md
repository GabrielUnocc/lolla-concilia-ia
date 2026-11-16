# AR Lolla — MVP frontend (uso local)

Conciliação bancária com IA, rodando só no navegador: IXC simulado, pareamento em código, análise das sobras com a API do Claude e indicadores.

> **Segurança:** a chave da API fica visível no navegador. Use só neste computador, em ambiente controlado. Não publique esta aplicação nem versione o `config.js`.

## Como rodar

1. Abra `config.js` e preencha `claude.apiKey` (sem chave, a app usa uma **IA simulada** por regras locais).
2. Abra `index.html` no Chrome ou Edge (duplo clique; não precisa de servidor nem de Node).
3. Crie uma senha local: ela cifra a base simulada e o histórico salvos no navegador.

## O que dá para fazer

- Buscar conta e período (a base simulada tem dados de 03/11 a 13/11/2026, em duas contas).
- Ver as duas grades com o status de cada linha: par automático, sobra, duplicado ou conciliado.
- Conciliar a seleção, conciliar todos os pares automáticos, desfazer a conciliação, lançar no IXC e estornar uma baixa.
- **Analisar sobras com IA**: cartões com causa, próximo passo e certeza; Aceitar ou Rejeitar; chat; copiar o resumo para o atendimento.
- **Indicadores**: totais, diferença por dia, % pareado pelo código, sobras por tipo, taxa de aceite, tokens e custo.
- **Configurações**: testar a conexão, forçar a IA simulada, ajustar erro e latência do IXC simulado, restaurar a base.

## Estrutura

| Pasta / arquivo | Responsabilidade |
|---|---|
| `config.js` | Configuração local (faz o papel do `.env`): chave, modelo, IXC, custo |
| `js/core/base.js` | Leitura da config, formatação pt-BR, store de estado |
| `js/services/cripto.js` | Criptografia: PBKDF2 + AES-GCM (Web Crypto) |
| `js/services/armazenamento.js` | Persistência: localStorage, com área cifrada |
| `js/services/ixc/` | Base simulada e cliente simulado do IXC (mesmo formato da tela de Conciliação Manual) |
| `js/services/claude/` | Integração com o Claude (único lugar com chave e URL), prompts e IA simulada |
| `js/domain/` | Pareamento, mascaramento (LGPD) e indicadores |
| `js/app/acoes.js` | Ações: ligam a interface aos serviços |
| `js/ui/` | Componentes e telas |

## Trocas futuras (sem reescrever a app)

- **IXC real:** criar um cliente com o mesmo contrato do `clienteSimulado.js` (listar contas, movimentação e extrato; conciliar, desconciliar, lançar, estornar) e ativar com `ixc.modo: 'real'` em `Lolla.services.ixc`.
- **Chave fora do navegador:** subir um intermediário, apontar `claude.baseUrl` para ele e usar `claude.autenticacao: 'intermediario'`. Só o `claudeService.js` conhece a autenticação.
- **Outro armazenamento** (IndexedDB ou backend): trocar só o `armazenamento.js`.

## Privacidade

Para a IA vão só: valor, data, documento, tx_id, origem da baixa, classificação e histórico mascarado. Nome do cliente, CPF e CNPJ não saem (veja `js/domain/mascaramento.js`). Todos os dados da base simulada são fictícios.

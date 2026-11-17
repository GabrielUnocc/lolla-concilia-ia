# 10. Modo Análise (issue #11)

[← Voltar ao índice](README.md)

O suporte envia **francesinha (PDF)**, **extrato (OFX)** e **relatório de recebimentos do IXC (CSV/XLS/XLSX)**. O código lê, normaliza e cruza tudo; a IA (opcional) só interpreta o que o código não explicou. Substitui o PROCV manual com a francesinha.

## Onde está

| Para | Caminho |
|---|---|
| Usar no navegador | `npm run intermediario` → http://127.0.0.1:8787/analise.html (ou abrir `mvp/analise.html` direto do disco, sem IA) |
| Usar pela extensão | popup da Lolla → **Modo Análise** (página `extensao/lolla/analise.html`) |
| Lógica (compartilhada) | `mvp/js/domain/analise/` → copiada para `extensao/lolla/lib/analise/` por `npm run sincronizar` |
| Intermediário da IA | `intermediario/` |
| Testes e amostras | `testes/unit/`, `testes/e2e/`, `testes/amostras/` |

## Arquitetura

```
arquivos ──► leitores ──► normalização ──► motor determinístico ──► resultado ──► (opcional) IA
            (por formato   (centavos,       A francesinha × IXC       resumo, 8 grupos,   só itens "precisa de
             e por banco)   AAAA-MM-DD,     B francesinha × OFX       linhas originais,   interpretação", mascarados,
                            nosso número)   C OFX × IXC (sobras)      CSV, texto do       com prévia, consentimento
                                            D classificação final     chamado             e limite de custo
```

| Arquivo (`mvp/js/domain/analise/`) | Responsabilidade |
|---|---|
| `normalizacao.js` | Camada central: valores em centavos, datas ISO, nosso número sem zeros/DV, texto com codificação corrigida, IDs como texto |
| `bancos.js` + `bancos/*.js` | Registro dos 6 bancos (um arquivo por banco): código COMPE, assinaturas da francesinha, layout de colunas, regra de crédito, regras de descrição do OFX. Identificação automática |
| `classificacaoOfx.js` | Categoria de cada lançamento do OFX (issue #7): recebimento, tarifa, estorno, transferência, rendimento, retenção, saída, não classificado |
| `leitorFrancesinha.js` | PDF com texto → títulos (âncoras de cabeçalho, mesma técnica da ferramenta Conciliacao). Recusa PDF escaneado |
| `leitorOfx.js` | Usa o `domain/ofx.js` existente e entrega no formato padrão |
| `planilha.js` | CSV, XLSX, XLS (BIFF8) e "XLS" HTML sem biblioteca externa |
| `leitorRecebimentos.js` | Acha o cabeçalho, sugere o mapeamento por nome de coluna (ajustável na tela), separa colunas pessoais |
| `motor.js` | Etapas A–D, justificativa de cada item, conferência de cobertura |
| `resultado.js` | Filtros/pesquisa, CSV e texto para o chamado |
| `privacidadeIa.js` | Monta o que vai para a IA, confere dados pessoais, valida a resposta |

## Regras do motor

| Regra | O que faz |
|---|---|
| A1 | Francesinha × IXC pelo nosso número (sem zeros à esquerda, sem o DV depois do hífen). Compara valor e data (pagamento ou crédito). Repetição em qualquer lado = duplicado |
| A2 | 2ª tentativa sem o último dígito (DV colado), só com valor igual e chave única dos dois lados. Gera aviso |
| A3 | Seu número da francesinha = ID do boleto no IXC (para recebimentos sem nosso número) |
| B1 | Títulos agrupados pela data de crédito: um ou mais créditos do dia (até 8) somando o total bruto ou líquido de tarifa, de D0 até D+N |
| B2 | Banco que credita título a título: valor por valor (créditos iguais no mesmo dia são equivalentes) |
| B3 | Nada bateu e há **um único** crédito de cobrança no dia → par com divergência de valor. Senão, "não encontrado no extrato" (não força par) |
| B-tarifa | Débitos de tarifa ligados às tarifas da francesinha, quando informadas |
| C | Sobras OFX × IXC com o `pareamento.js` existente (identificador → valor + D0/D+1 → lote ≤ 18). Par ambíguo **não** é aceito: lista todos os candidatos |
| D | Boleto com 2+ baixas, linha repetida no OFX, título sem baixa, baixa sem pagamento (possível baixa manual), entradas diversas, saídas fora do escopo |

- Regra de crédito por banco (`credito.modo` lote/individual/auto, `toleranciaDias`, `tarifa` descontada/separada/desconhecida) no módulo do banco; o analista pode ajustar na tela.
- Toda linha lida aparece em pelo menos um item. Se não aparecer, a tela mostra erro (nada é ignorado em silêncio).
- O `pareamento.js` foi indexado por valor e por dia (5 mil linhas em ~0,2 s). Um teste compara com a versão original em 300 cenários: o resultado é idêntico.

## Privacidade e IA

- Arquivos lidos só no navegador. Nada é guardado em servidor.
- Para a IA vão só os itens marcados como "precisa de interpretação", com valor, data, nosso número, IDs, FITID, categoria e descrição do extrato mascarada. Nome, CPF/CNPJ, conta e linha original não saem.
- Conferência dupla: no navegador (inclui os nomes lidos dos próprios arquivos) e no intermediário (CPF, CNPJ, e-mail, telefone, campos proibidos).
- O analista vê o JSON exato, a estimativa de tokens e de R$, o limite por análise e o saldo do dia, e só então marca a confirmação e envia.
- A chave fica só no intermediário (`intermediario/.env`). O prompt também fica nele, então a chave não serve para outra coisa.
- A resposta é validada: refs que não foram enviadas são removidas e avisadas; certeza inválida vira "baixa"; itens sem resposta são listados.
- Modelos: Haiku (padrão), Sonnet (comparação), Opus desabilitado (não necessário no MVP). Preços configuráveis.

## Pendências técnicas

| Pendência | Situação |
|---|---|
| Leitores de francesinha de Bradesco, Banco do Brasil, Sicredi, Itaú e Santander | Estrutura pronta (`bancos/*.js`, status "pendente"). Falta amostra mascarada de cada um |
| Regra de crédito do Sicoob (lote diário × por título; tarifa descontada × separada) | Hoje testa as duas formas. Confirmar com extrato real |
| Coluna do nosso número no relatório de recebimentos do IXC | Mapeamento automático por sinônimos + ajuste manual. Confirmar o nome e o formato (com ou sem DV) num relatório real |
| Data da baixa no IXC (pagamento × crédito) | O motor aceita as duas; confirmar o padrão do relatório |
| Análise parcial com 2 arquivos (RF14) | O motor já executa só as etapas possíveis (testado); a tela ainda exige os 3 arquivos |
| OCR de PDF escaneado | Fora desta versão: o arquivo é recusado com mensagem clara |
| Ajuste manual das colunas da francesinha | Hoje só pelo módulo do banco (âncoras) |
| Classificação do OFX por banco (issue #7) | Regras genéricas + Sicoob. Faltam exemplos reais dos outros bancos |

## Dependências externas

- **pdf.js 3.11.174** (Mozilla, Apache-2.0), copiado em `mvp/vendor/pdfjs/` (e na extensão). Sem CDN. `isEvalSupported:false`.
- **Intermediário**: Node 22+, sem pacotes. Precisa da chave da API da empresa (`ANTHROPIC_API_KEY`) e da definição de limite de gasto (TI/Liderança). Para trocar por uma solução homologada, basta manter o contrato `GET /v1/status` e `POST /v1/interpretar` (ver `intermediario/README.md`).
- **Testes ponta a ponta**: Playwright + Chromium (opcional, só para `npm run test:e2e`).
- Gerador de amostras: Python 3 com `reportlab` e `openpyxl` (e LibreOffice para o `.xls`).

## Precisa de amostras reais para validar

1. Francesinha Sicoob real (PDF), mascarada: confirmar âncoras, linhas de total e títulos em várias páginas.
2. Extrato OFX Sicoob do mesmo período: descrição do crédito de cobrança, se vem em lote e como vem a tarifa.
3. Relatório de recebimentos do IXC exportado em CSV e em XLS/XLSX: nomes das colunas, nosso número, conta.
4. Os 30 casos da issue #8, para medir acerto das regras e da IA (Haiku × Sonnet).
5. Uma francesinha + OFX mascarados de cada um dos outros cinco bancos.

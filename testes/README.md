# Testes do Modo Análise

```bash
npm test            # unitários (node --test) + conferência da cópia na extensão
npm run test:e2e    # ponta a ponta no Chromium (precisa do Playwright)
npm run amostras    # gera de novo as amostras fictícias (Python: reportlab + openpyxl; LibreOffice para .xls)
```

| Pasta | O que tem |
|---|---|
| `unit/` | Normalização, bancos e classificação do OFX, leitores (PDF, OFX, CSV, XLSX, XLS, HTML), motor (gabarito, regras, parcial, 5 mil linhas), privacidade, CSV/chamado, intermediário (com API falsa local) e equivalência do pareamento otimizado |
| `e2e/` | Fluxo completo na página: upload, banco, cruzamento, filtros, linhas originais, CSV, cópia, IA com consentimento, 360/768/1440 px, `file://` |
| `amostras/` | Arquivos **fictícios** do Sicoob (nomes e CPFs inventados) e o gerador |
| `referencia/` | Cópia do `pareamento.js` original, usada só para provar que a versão otimizada dá o mesmo resultado |

## Gabarito das amostras (Sicoob, 03 a 08/11/2026)

| Situação plantada | Resultado esperado |
|---|---|
| 5 títulos com crédito em 04/11 = um crédito de R$ 549,50 | Lote conciliado (B1) |
| Título 1004: pago R$ 149,90 (mora R$ 10), IXC baixou R$ 139,90 | Valor diferente, explicado (valor original do título) |
| Título 1005 sem nosso número no IXC, seu número = ID do boleto | Conciliado pela regra A3 |
| Título 1007 com duas baixas no IXC | Baixa duplicada |
| Título 1008 pago sem baixa no IXC | Somente no banco |
| Título 1009 baixado em 06/11 (pago 04/11, crédito 05/11) | Diferença de data |
| Lote previsto para 05/11 creditado em 06/11 | D+1 / data de crédito |
| Lote de 06/11 com R$ 3,00 a menos | Valor diferente (possível tarifa) → vai para a IA |
| Título 1012 com DV colado no IXC (10123) | Conciliado pela regra A2 (com aviso) |
| PIX R$ 60,00 repetido no OFX (mesmo FITID) | Lançamento repetido + 1 par conciliado |
| Dois PIX de R$ 75,00 no mesmo dia e uma baixa | Par ambíguo (não concilia sozinho) |
| Dinheiro R$ 45,00 sem crédito | Possível baixa manual |
| Nosso número 1099 baixado sem pagamento | Somente no IXC |
| 2 boletos fora da francesinha (R$ 80 + R$ 120) e crédito de R$ 200 no dia seguinte | Lote OFX × IXC em D+1 |
| TED, rendimento, tarifa e pagamento a fornecedor | Entrada diversa, tarifa e saída fora do escopo |

Os testes não usam dados reais. Amostras reais mascaradas (issue #8) entram aqui quando existirem.

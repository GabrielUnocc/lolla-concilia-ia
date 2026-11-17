#!/usr/bin/env python3
"""
Gera as amostras FICTÍCIAS do Modo Análise (Sicoob): francesinha em PDF (com texto e "escaneada"),
extrato OFX e relatório de recebimentos do IXC em CSV, XLSX, XLS e "XLS" HTML.
Nomes, CPFs e valores são inventados. O gabarito esperado está em README.md e nos testes.
Uso: python3 testes/amostras/gerar_amostras.py   (precisa de reportlab e openpyxl; XLS usa o LibreOffice se existir)
"""
import os, shutil, subprocess, datetime as dt
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas
import openpyxl

AQUI = os.path.dirname(os.path.abspath(__file__))

def brl(c):  # centavos -> "1.234,56"
    s = f"{c/100:,.2f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")

# ------------------------------------------------------------------ francesinha
# (sacado, nosso, seu, previsao_credito, vencimento, valor_titulo, mora, desconto, liquidacao, cobrado)
T = [
  ("CLIENTE FICTICIO UM",     "1001-7", "50001", "04/11/2026", "03/11/2026",  9990,    0, 0, "03/11/2026",  9990),
  ("CLIENTE FICTICIO DOIS",   "1002-5", "50002", "04/11/2026", "03/11/2026", 11990,    0, 0, "03/11/2026", 11990),
  ("CLIENTE FICTICIO TRES",   "1003-3", "50003", "04/11/2026", "05/11/2026",  7990,    0, 0, "03/11/2026",  7990),
  ("CLIENTE FICTICIO QUATRO", "1004-1", "50004", "04/11/2026", "28/10/2026", 13990, 1000, 0, "03/11/2026", 14990),
  ("CLIENTE FICTICIO CINCO",  "1005-0", "50005", "04/11/2026", "03/11/2026",  9990,    0, 0, "03/11/2026",  9990),
  ("CLIENTE FICTICIO SEIS",   "1006-8", "50006", "05/11/2026", "04/11/2026",  8990,    0, 0, "04/11/2026",  8990),
  ("CLIENTE FICTICIO SETE",   "1007-6", "50007", "05/11/2026", "04/11/2026",  9990,    0, 0, "04/11/2026",  9990),
  ("CLIENTE FICTICIO OITO",   "1008-4", "50008", "05/11/2026", "04/11/2026", 10990,    0, 0, "04/11/2026", 10990),
  ("CLIENTE FICTICIO NOVE",   "1009-2", "50009", "05/11/2026", "04/11/2026",  5990,    0, 0, "04/11/2026",  5990),
  ("CLIENTE FICTICIO DEZ",    "1010-6", "50010", "06/11/2026", "05/11/2026",  9990,    0, 0, "05/11/2026",  9990),
  ("CLIENTE FICTICIO ONZE",   "1011-4", "50011", "06/11/2026", "05/11/2026",  9990,    0, 0, "05/11/2026",  9990),
  ("CLIENTE FICTICIO DOZE",   "1012-3", "50012", "06/11/2026", "05/11/2026", 12990,    0, 0, "05/11/2026", 12990),
]

COLS = [("Sacado", 20), ("Nosso Número", 150), ("Seu Número", 222), ("Dt. Previsão Crédito", 282), ("Vencimento", 372),
        ("Dt. Limite Pgto", 432), ("Valor (R$)", 500), ("Vlr. Mora", 556), ("Vlr. Desc.", 604), ("Vlr. Outros", 650),
        ("Dt. Liquid.", 700), ("Vlr. Cobrado", 770)]

def francesinha(caminho):
    c = canvas.Canvas(caminho, pagesize=landscape(A4))
    c.setTitle("Francesinha ficticia Sicoob")
    def cabecalho(pagina):
        c.setFont("Helvetica-Bold", 11)
        c.drawString(20, 560, "SICOOB - Sistema de Cooperativas de Crédito do Brasil")
        c.setFont("Helvetica", 9)
        c.drawString(20, 545, "Relatório de Títulos Liquidados (Francesinha) - DADOS FICTÍCIOS PARA TESTE")
        c.drawString(20, 532, "Cooperativa: 0001  Conta: 99999-9   Período: 03/11/2026 a 05/11/2026")
        c.drawString(700, 560, f"Página {pagina}")
        c.setFont("Helvetica-Bold", 7)
        for nome, x in COLS:
            c.drawString(x, 510, nome)
        c.setFont("Helvetica", 7)
    y = 495; pagina = 1
    cabecalho(pagina)
    for k, t in enumerate(T):
        if k == 7:  # quebra de página no meio, para testar o cabeçalho repetido
            c.showPage(); pagina += 1; cabecalho(pagina); y = 495
        sac, nn, seu, prev, venc, val, mora, desc, liq, cob = t
        campos = [sac, nn, seu, prev, venc, venc, brl(val), brl(mora), brl(desc), brl(0), liq, brl(cob)]
        for (nome, x), v in zip(COLS, campos):
            c.drawString(x, y, v)
        y -= 14
    y -= 6
    c.setFont("Helvetica-Bold", 7)
    c.drawString(20, y, "Total de títulos: 12")
    c.drawString(500, y, brl(sum(t[5] for t in T)))
    c.drawString(770, y, brl(sum(t[9] for t in T)))
    c.save()

def escaneada(caminho):
    c = canvas.Canvas(caminho, pagesize=landscape(A4))
    c.setFillGray(0.85)
    for k in range(20):  # "imagem" sem camada de texto
        c.rect(20, 500 - k * 18, 780, 10, fill=1, stroke=0)
    c.save()

# ------------------------------------------------------------------ OFX
# (data, valor em centavos, fitid, memo)
O = [
  ("20261103",   6000, "F0001", "PIX RECEBIDO - JOSE TESTE FICTICIO"),
  ("20261103",   6000, "F0001", "PIX RECEBIDO - JOSE TESTE FICTICIO"),     # repetido (mesmo FITID)
  ("20261104",  54950, "F0002", "CRÉD.LIQUIDAÇÃO COBRANÇA"),               # lote do dia 04 (5 títulos)
  ("20261105",  12000, "F0003", "PIX RECEBIDO - MARIA FICTICIA"),
  ("20261105",   7500, "F0004", "PIX RECEBIDO - ANA FICTICIA"),
  ("20261105",   7500, "F0005", "PIX RECEBIDO - BETO FICTICIO"),            # dois PIX iguais: ambíguo
  ("20261105",  50000, "F0006", "CRED TED - EMPRESA FICTICIA LTDA"),
  ("20261106",  35960, "F0007", "CRÉD.LIQUIDAÇÃO COBRANÇA"),               # lote previsto p/ 05, veio em 06 (D+1)
  ("20261106",  32670, "F0008", "CRÉD.LIQUIDAÇÃO COBRANÇA"),               # lote do dia 06 com R$ 3,00 a menos
  ("20261106", -35000, "F0009", "PAGTO FORNECEDOR FICTICIO"),
  ("20261107",   -450, "F0010", "DÉB.TARIFA COBRANÇA"),
  ("20261107",    123, "F0011", "RENDIMENTO APLIC.AUTOMATICA"),
  ("20261108",  20000, "F0012", "CRÉD.LIQUIDAÇÃO COBRANÇA"),               # lote de 2 boletos fora da francesinha
]

def ofx(caminho):
    linhas = ["OFXHEADER:100", "DATA:OFXSGML", "VERSION:102", "SECURITY:NONE", "ENCODING:USASCII", "CHARSET:1252",
              "COMPRESSION:NONE", "OLDFILEUID:NONE", "NEWFILEUID:NONE", "", "<OFX>", "<BANKMSGSRSV1><STMTTRNRS><STMTRS>",
              "<CURDEF>BRL", "<BANKACCTFROM><BANKID>756<BRANCHID>0001<ACCTID>99999-9<ACCTTYPE>CHECKING</BANKACCTFROM>",
              "<BANKTRANLIST><DTSTART>20261103<DTEND>20261108"]
    for d, v, f, m in O:
        linhas += ["<STMTTRN>", f"<TRNTYPE>{'CREDIT' if v > 0 else 'DEBIT'}", f"<DTPOSTED>{d}120000[-3:BRT]",
                   f"<TRNAMT>{v/100:.2f}", f"<FITID>{f}", f"<MEMO>{m}", "</STMTTRN>"]
    linhas += ["</BANKTRANLIST>", "<LEDGERBAL><BALAMT>1000.00<DTASOF>20261108</LEDGERBAL>", "</STMTRS></STMTTRNRS></BANKMSGSRSV1>", "</OFX>"]
    with open(caminho, "wb") as fh:
        fh.write("\r\n".join(linhas).encode("cp1252"))

# ------------------------------------------------------------------ recebimentos IXC
CAB = ["ID", "ID Boleto", "Cliente", "CPF/CNPJ", "Nosso Número", "Vencimento", "Data Pagamento", "Valor Original", "Valor Recebido", "Conta", "Forma Pagamento"]
# (id, id_boleto, cliente, cpf, nosso, venc, pagamento, original, recebido, forma)
RCB = [
  (9001, 50001, "CLIENTE FICTICIO UM",     "111.444.777-35", "1001",  "03/11/2026", "03/11/2026",  9990,  9990, "Boleto"),
  (9002, 50002, "CLIENTE FICTICIO DOIS",   "222.555.888-46", "1002",  "03/11/2026", "03/11/2026", 11990, 11990, "Boleto"),
  (9003, 50003, "CLIENTE FICTICIO TRES",   "333.666.999-57", "1003",  "05/11/2026", "03/11/2026",  7990,  7990, "Boleto"),
  (9004, 50004, "CLIENTE FICTICIO QUATRO", "12.345.678/0001-95", "1004", "28/10/2026", "03/11/2026", 13990, 13990, "Boleto"),
  (9005, 50005, "CLIENTE FICTICIO CINCO",  "444.777.000-68", "",      "03/11/2026", "03/11/2026",  9990,  9990, "Boleto"),
  (9006, 50006, "CLIENTE FICTICIO SEIS",   "555.888.111-79", "1006",  "04/11/2026", "04/11/2026",  8990,  8990, "Boleto"),
  (9007, 50007, "CLIENTE FICTICIO SETE",   "666.999.222-80", "1007",  "04/11/2026", "04/11/2026",  9990,  9990, "Boleto"),
  (9008, 50007, "CLIENTE FICTICIO SETE",   "666.999.222-80", "1007",  "04/11/2026", "04/11/2026",  9990,  9990, "Manual"),
  (9009, 50009, "CLIENTE FICTICIO NOVE",   "777.000.333-91", "1009",  "04/11/2026", "06/11/2026",  5990,  5990, "Boleto"),
  (9010, 50010, "CLIENTE FICTICIO DEZ",    "888.111.444-02", "1010",  "05/11/2026", "05/11/2026",  9990,  9990, "Boleto"),
  (9011, 50011, "CLIENTE FICTICIO ONZE",   "999.222.555-13", "1011",  "05/11/2026", "05/11/2026",  9990,  9990, "Boleto"),
  (9012, 50012, "CLIENTE FICTICIO DOZE",   "123.123.123-87", "10123", "05/11/2026", "05/11/2026", 12990, 12990, "Boleto"),
  (9013, 50013, "CLIENTE FICTICIO TREZE",  "321.321.321-09", "",      "05/11/2026", "03/11/2026",  6000,  6000, "PIX"),
  (9014, 50014, "CLIENTE FICTICIO CATORZE","456.456.456-56", "",      "05/11/2026", "05/11/2026", 12000, 12000, "PIX"),
  (9015, 50015, "CLIENTE FICTICIO QUINZE", "654.654.654-49", "",      "05/11/2026", "05/11/2026",  7500,  7500, "PIX"),
  (9016, 50016, "CLIENTE FICTICIO DEZESSEIS","789.789.789-78", "",    "03/11/2026", "03/11/2026",  4500,  4500, "Dinheiro"),
  (9017, 50017, "CLIENTE FICTICIO DEZESSETE","987.987.987-63", "1099","04/11/2026", "04/11/2026",  7000,  7000, "Boleto"),
  (9018, 50018, "CLIENTE FICTICIO DEZOITO", "147.147.147-49", "1020", "07/11/2026", "07/11/2026",  8000,  8000, "Boleto"),
  (9019, 50019, "CLIENTE FICTICIO DEZENOVE","258.258.258-27", "1021", "07/11/2026", "07/11/2026", 12000, 12000, "Boleto"),
]

def linha_txt(r):
    return [str(r[0]), str(r[1]), r[2], r[3], r[4], r[5], r[6], brl(r[7]), brl(r[8]), "SICOOB 99999-9", r[9]]

def csv(caminho):
    with open(caminho, "w", encoding="utf-8-sig", newline="") as fh:
        fh.write("Relatório de recebimentos - DADOS FICTÍCIOS\r\n\r\n")
        fh.write(";".join(CAB) + "\r\n")
        for r in RCB:
            fh.write(";".join(f'"{c}"' if ";" in c else c for c in linha_txt(r)) + "\r\n")
        fh.write(f";;;;;;;Total;{brl(sum(r[8] for r in RCB))};;\r\n")

def xlsx(caminho):
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Recebimentos"
    ws.append(["Relatório de recebimentos - DADOS FICTÍCIOS"]); ws.append([])
    ws.append(CAB)
    data = lambda s: dt.datetime.strptime(s, "%d/%m/%Y").date()
    for r in RCB:
        ws.append([r[0], r[1], r[2], r[3], int(r[4]) if r[4] else None, data(r[5]), data(r[6]), r[7] / 100, r[8] / 100, "SICOOB 99999-9", r[9]])
        for col in (6, 7): ws.cell(ws.max_row, col).number_format = "DD/MM/YYYY"
        for col in (8, 9): ws.cell(ws.max_row, col).number_format = "#,##0.00"
    ws.append(["", "", "", "", "", "", "", "Total", sum(r[8] for r in RCB) / 100])
    wb.save(caminho)

def html(caminho):
    linhas = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in linha_txt(r)) + "</tr>" for r in RCB)
    with open(caminho, "w", encoding="utf-8") as fh:
        fh.write("<html><head><meta charset='utf-8'></head><body><table><tr>" + "".join(f"<th>{c}</th>" for c in CAB) + "</tr>" + linhas + "</table></body></html>")

if __name__ == "__main__":
    francesinha(os.path.join(AQUI, "sicoob-francesinha.pdf"))
    escaneada(os.path.join(AQUI, "francesinha-escaneada.pdf"))
    ofx(os.path.join(AQUI, "sicoob-extrato.ofx"))
    csv(os.path.join(AQUI, "ixc-recebimentos.csv"))
    xlsx(os.path.join(AQUI, "ixc-recebimentos.xlsx"))
    html(os.path.join(AQUI, "ixc-recebimentos-html.xls"))
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if soffice:
        subprocess.run([soffice, "--headless", "--convert-to", "xls:MS Excel 97", "--outdir", AQUI, os.path.join(AQUI, "ixc-recebimentos.xlsx")],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print("amostras geradas em", AQUI)

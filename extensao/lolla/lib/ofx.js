/*
 * Leitura e validação de arquivos OFX (1.x SGML e 2.x XML), tudo no navegador.
 * O arquivo não sai do computador: só o resultado mascarado vai para a IA.
 */
Lolla.domain.ofx = (function () {
  const BANCOS = { '001': 'Banco do Brasil', '033': 'Santander', '041': 'Banrisul', '077': 'Inter', '104': 'Caixa', '237': 'Bradesco',
    '260': 'Nubank', '336': 'C6', '341': 'Itaú', '422': 'Safra', '748': 'Sicredi', '756': 'Sicoob', '085': 'Ailos', '136': 'Unicred' };

  // Lê o arquivo respeitando o charset do cabeçalho (OFX de banco costuma vir em Windows-1252)
  async function lerArquivo(arquivo) {
    const buf = await arquivo.arrayBuffer();
    const cabecalho = new TextDecoder('ascii').decode(buf.slice(0, 600));
    const utf8 = /ENCODING\s*[:=]\s*"?UTF-?8/i.test(cabecalho) || /CHARSET\s*:\s*UTF-?8/i.test(cabecalho);
    let texto = new TextDecoder(utf8 ? 'utf-8' : 'windows-1252').decode(buf);
    if (!utf8 && /Ã[\u0080-¿]/.test(texto)) texto = new TextDecoder('utf-8').decode(buf); // veio UTF-8 sem avisar
    return texto;
  }

  const tag = (bloco, nome) => {
    const m = bloco.match(new RegExp('<' + nome + '>([^<\\r\\n]*)', 'i'));
    return m ? m[1].trim() : '';
  };
  const dataOfx = (s) => (/^\d{8}/.test(s || '') ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : '');
  const centavos = (s) => {
    s = String(s || '').trim();
    if (!s) return NaN;
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); // "1.234,56"
    return Math.round(Number(s) * 100);
  };

  function interpretar(texto, nomeArquivo) {
    if (!/<OFX>/i.test(texto)) throw new Error('Este arquivo não parece um OFX (não tem a marca <OFX>).');
    const blocos = texto.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>|<\/BANKTRANLIST>/i)[0]);
    const conta = {
      bancoCodigo: tag(texto, 'BANKID').replace(/^0+(?=\d{3})/, '').padStart(3, '0'),
      agencia: tag(texto, 'BRANCHID'),
      numero: tag(texto, 'ACCTID')
    };
    conta.banco = BANCOS[conta.bancoCodigo] || (conta.bancoCodigo !== '000' ? 'Banco ' + conta.bancoCodigo : 'Banco');
    const periodo = { inicio: dataOfx(tag(texto, 'DTSTART')), fim: dataOfx(tag(texto, 'DTEND')) };
    const saldoTxt = (texto.match(/<LEDGERBAL>[\s\S]*?<BALAMT>([^<\r\n]*)/i) || [])[1];

    const linhas = [], invalidas = [];
    blocos.forEach((b, k) => {
      const valor = centavos(tag(b, 'TRNAMT'));
      const data = dataOfx(tag(b, 'DTPOSTED'));
      const l = {
        n: k + 1, data, valor, tipo: tag(b, 'TRNTYPE'), fitid: tag(b, 'FITID'),
        documento: tag(b, 'CHECKNUM') || tag(b, 'REFNUM'),
        historico: [tag(b, 'MEMO'), tag(b, 'NAME')].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
      };
      if (!data || !isFinite(valor) || valor === 0) invalidas.push({ n: l.n, motivo: !data ? 'sem data' : 'sem valor' });
      else linhas.push(l);
    });
    if (!linhas.length) throw new Error('Nenhum lançamento válido encontrado no OFX.');

    // Alertas de validação (RF02)
    const porFitid = {};
    linhas.forEach((l) => { if (l.fitid) (porFitid[l.fitid] = porFitid[l.fitid] || []).push(l.n); });
    const fitidRepetido = Object.entries(porFitid).filter(([, ns]) => ns.length > 1).map(([fitid, ns]) => ({ fitid, linhas: ns }));
    const assinatura = (l) => [l.data, l.valor, l.documento, l.historico].join('|');
    const porAss = {};
    linhas.forEach((l) => { (porAss[assinatura(l)] = porAss[assinatura(l)] || []).push(l.n); });
    const linhaRepetida = Object.values(porAss).filter((ns) => ns.length > 1);
    const datas = linhas.map((l) => l.data).sort();
    if (!periodo.inicio) periodo.inicio = datas[0];
    if (!periodo.fim) periodo.fim = datas[datas.length - 1];
    const fora = linhas.filter((l) => l.data < periodo.inicio || l.data > periodo.fim).map((l) => l.n);
    const semFitid = linhas.filter((l) => !l.fitid).length;

    return {
      arquivo: nomeArquivo || '', conta, periodo,
      saldoFinal: saldoTxt != null ? centavos(saldoTxt) : null,
      linhas,
      resumo: {
        total: linhas.length,
        creditos: linhas.filter((l) => l.valor > 0).reduce((a, l) => a + l.valor, 0),
        debitos: linhas.filter((l) => l.valor < 0).reduce((a, l) => a - l.valor, 0),
        qtdCreditos: linhas.filter((l) => l.valor > 0).length,
        qtdDebitos: linhas.filter((l) => l.valor < 0).length
      },
      alertas: { invalidas, fitidRepetido, linhaRepetida, fora, semFitid }
    };
  }

  return { lerArquivo, interpretar, BANCOS };
})();

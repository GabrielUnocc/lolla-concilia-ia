/*
 * Modo Análise — leitor do extrato OFX.
 * Reaproveita Lolla.domain.ofx (charset, OFX 1.x/2.x e alertas) e entrega no formato padrão:
 *   { ref: 'E:n', linha: n, fitid, data, valor (centavos, negativo = débito), tipo, descricao, documento, bruto }
 * Linhas sem data/valor não somem: viram aviso com o número da linha.
 */
(function (g) {
  const L = g.Lolla;
  const A = L.domain.analise;

  function ler(texto, nomeArquivo) {
    const norm = A.norm;
    const ofx = L.domain.ofx.interpretar(texto, nomeArquivo);   // lança erro claro se não for OFX ou não tiver lançamentos
    const blocos = texto.split(/<STMTTRN>/i).slice(1).map((b) => '<STMTTRN>' + b.split(/<\/STMTTRN>|<\/BANKTRANLIST>/i)[0].trim() + (/<\/STMTTRN>/i.test(b) ? '</STMTTRN>' : ''));
    const registros = ofx.linhas.map((l) => ({
      ref: 'E:' + l.n,
      origem: 'ofx',
      linha: l.n,
      fitid: norm.id(l.fitid),
      data: l.data,
      valor: l.valor,
      tipo: l.tipo,
      descricao: norm.texto(l.historico),
      documento: norm.id(l.documento),
      bruto: (blocos[l.n - 1] || '').replace(/\s*\n\s*/g, ' ')
    }));
    const a = ofx.alertas;
    const avisos = [];
    a.invalidas.forEach((x) => avisos.push({ tipo: 'linha_invalida', linha: x.n, texto: `Lançamento ${x.n} do OFX sem ${x.motivo.replace('sem ', '')}: não entra no cruzamento` }));
    a.fitidRepetido.forEach((x) => avisos.push({ tipo: 'fitid_repetido', texto: `FITID ${x.fitid} aparece nos lançamentos ${x.linhas.join(', ')}` }));
    a.linhaRepetida.forEach((ns) => avisos.push({ tipo: 'linha_repetida', texto: `Lançamentos ${ns.join(', ')} são idênticos (data, valor, documento e descrição)` }));
    if (a.fora.length) avisos.push({ tipo: 'fora_periodo', texto: `${a.fora.length} lançamento(s) fora do período declarado no arquivo` });
    if (a.semFitid) avisos.push({ tipo: 'sem_fitid', texto: `${a.semFitid} lançamento(s) sem FITID` });
    return {
      tipo: 'ofx',
      arquivo: nomeArquivo || '',
      conta: ofx.conta,
      periodo: ofx.periodo,
      saldoFinal: ofx.saldoFinal,
      registros,
      ignoradas: a.invalidas.map((x) => ({ linha: x.n, motivo: x.motivo })),
      avisos,
      resumo: ofx.resumo
    };
  }

  A.leitorOfx = { ler };
})(typeof self !== 'undefined' ? self : globalThis);

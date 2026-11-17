/*
 * Processamento: pareamento automático em código (porta do historico/extrator-v0/extrator.js).
 * Toda soma e comparação fica aqui, nunca na IA. Valores em centavos.
 * Indexado por valor e por dia (nov/2026, Modo Análise): mesmo resultado da versão original,
 * sem comparar todas as linhas com todas — aguenta ~5 mil linhas no navegador.
 *
 * Ordem: 1) identificador (tx_id/documento)  2) valor + data (D0/D+1)
 *        3) lote (crédito = soma de 2+ recebimentos, até 18 candidatos)
 *        4) possíveis duplicados (mesmo documento 2+ vezes no IXC)
 */
Lolla.domain.pareamento = (function () {
  const dia = Lolla.core.fmt.dia;
  const LIMITE_LOTE = 18;

  // Classifica a linha do extrato pela descrição, tolerando caracteres quebrados do OFX
  function classificarExtrato(l) {
    const h = String(l.historico || '').normalize('NFD').replace(/[^A-Za-z0-9 ]/g, '').toUpperCase();
    if (/TARIFA/.test(h)) return 'tarifa';
    if (/ESTORNO|DEVOLUC/.test(h)) return 'estorno';
    if (/BLOQ|RETENC|JUDICIAL/.test(h)) return 'retenção';
    if (l.valor < 0) return 'saida';
    if (/RENDIMENTO|APLIC|TED RECEB|JUROS/.test(h)) return 'entrada diversa';
    if (/LIQUIDA|COBRAN|BOLETO|PIX|LOTE/.test(h)) return 'recebimento';
    return 'entrada diversa';
  }

  // Buffer reaproveitado para as somas da busca de lote (2^18 combinações no máximo)
  let somas = null;

  // Existe subconjunto com 2+ itens somando "alvo"? Divide em duas metades (2^9 + 2^9 somas em vez de 2^18).
  function existeLote(vals, alvo) {
    const meio = vals.length >> 1, esq = vals.slice(0, meio), dir = vals.slice(meio);
    const somasDe = (arr) => {
      const out = [{ s: 0, q: 0 }];
      arr.forEach((v) => { const n = out.length; for (let k = 0; k < n; k++) out.push({ s: out[k].s + v, q: out[k].q + 1 }); });
      return out;
    };
    const maxQtd = new Map();
    somasDe(esq).forEach(({ s, q }) => { if (!(maxQtd.get(s) >= q)) maxQtd.set(s, q); });
    return somasDe(dir).some(({ s, q }) => { const qe = maxQtd.get(alvo - s); return qe != null && qe + q >= 2; });
  }

  function parear(movimentacao, extrato) {
    const ixc = movimentacao.filter((l) => !l.conciliado);
    const ban = extrato.filter((l) => !l.conciliado);
    const pares = [];
    const usadoI = new Set(), usadoE = new Set();
    const marcar = (tipo, ii, ei, ambiguo) => {
      pares.push({ tipo, ambiguo: !!ambiguo, ixc: ii.map((k) => ixc[k].id), extrato: [ban[ei].id] });
      ii.forEach((k) => usadoI.add(k)); usadoE.add(ei);
    };

    // Índices (evitam comparar todas as linhas com todas): extrato por valor e IXC por dia.
    // A ordem de varredura é a mesma da versão original, então o resultado é idêntico.
    const extPorValor = new Map();
    ban.forEach((e, ei) => { const l = extPorValor.get(e.valor); if (l) l.push(ei); else extPorValor.set(e.valor, [ei]); });
    const diaE = ban.map((e) => dia(e.data));
    const diaI = ixc.map((i) => dia(i.data));

    // 1) identificador (mesmo valor e mesmo tx_id ou documento)
    ixc.forEach((i, ii) => {
      const lista = extPorValor.get(i.valor);
      if (!lista) return;
      for (const ei of lista) {
        if (usadoE.has(ei)) continue;
        const e = ban[ei];
        if ((i.tx_id && i.tx_id === e.tx_id) || (i.documento && i.documento === e.documento)) { marcar('identificador', [ii], ei); return; }
      }
    });

    // 2) valor + data (D0 ou D+1) — marca ambíguo se houver mais de um candidato
    ixc.forEach((i, ii) => {
      if (usadoI.has(ii)) return;
      const lista = extPorValor.get(i.valor);
      if (!lista) return;
      const cand = [];
      for (const ei of lista) {
        if (usadoE.has(ei)) continue;
        const d = diaE[ei] - diaI[ii];
        if (d >= 0 && d <= 1) cand.push(ei);
      }
      if (cand.length) marcar('valor + data', [ii], cand[0], cand.length > 1);
    });

    // 3) lote: crédito = soma de 2+ recebimentos do mesmo dia ou da véspera (até LIMITE_LOTE candidatos)
    const ixcPorDia = new Map();
    ixc.forEach((i, ii) => { const l = ixcPorDia.get(diaI[ii]); if (l) l.push(ii); else ixcPorDia.set(diaI[ii], [ii]); });
    ban.forEach((e, ei) => {
      if (usadoE.has(ei) || e.valor <= 0) return;
      const a = ixcPorDia.get(diaE[ei]) || [], b = ixcPorDia.get(diaE[ei] - 1) || [];
      const cand = [];
      for (let x = 0, y = 0; (x < a.length || y < b.length) && cand.length < LIMITE_LOTE;) {
        const ii = y >= b.length || (x < a.length && a[x] < b[y]) ? a[x++] : b[y++];   // mantém a ordem original do IXC
        if (!usadoI.has(ii) && ixc[ii].valor > 0) cand.push(ii);
      }
      if (cand.length < 2) return;
      const vals = cand.map((ii) => ixc[ii].valor);
      if (vals.reduce((s, v) => s + v, 0) < e.valor) return;          // nem somando tudo chega: não há lote
      if (!existeLote(vals, e.valor)) return;                          // teste rápido (meio a meio) antes de enumerar
      const n = cand.length, total = 1 << n;
      if (!somas || somas.length < total) somas = new Float64Array(1 << LIMITE_LOTE);
      somas[0] = 0;
      for (let m = 1; m < total; m++) {
        const baixo = m & -m;
        somas[m] = somas[m ^ baixo] + vals[31 - Math.clz32(baixo)];
        if ((m & (m - 1)) !== 0 && somas[m] === e.valor) {
          const sel = [];
          for (let k = 0; k < n; k++) if (m & (1 << k)) sel.push(cand[k]);
          marcar('lote', sel, ei);
          return;
        }
      }
    });

    // 4) duplicados (olha a lista inteira, inclusive o que já foi pareado)
    // (mesmo documento ou mesmo tx_id; inclui já conciliados; só reporta se ainda houver linha pendente)
    function repetidos(linhas) {
      const porChave = {};
      linhas.filter((i) => i.valor > 0).forEach((i) => {
        const chave = i.documento || i.tx_id;
        if (chave) (porChave[chave] = porChave[chave] || []).push(i);
      });
      return Object.entries(porChave)
        .filter(([, ls]) => ls.length > 1 && ls.some((l) => !l.conciliado))
        .map(([documento, ls]) => ({ documento, ids: ls.map((l) => l.id), pendentes: ls.filter((l) => !l.conciliado).map((l) => l.id) }));
    }
    const duplicados = repetidos(movimentacao);
    const duplicadosOfx = repetidos(extrato); // mesma linha 2x no OFX importado

    // Mapa de status por linha, para a interface
    const status = {};
    pares.forEach((p) => {
      p.ixc.forEach((id) => { status['M:' + id] = p.tipo; });
      p.extrato.forEach((id) => { status['E:' + id] = p.tipo; });
    });
    duplicados.forEach((d) => d.pendentes.forEach((id) => { status['M:' + id] = 'duplicado'; }));
    duplicadosOfx.forEach((d) => d.pendentes.forEach((id) => { if (!status['E:' + id]) status['E:' + id] = 'duplicado'; }));

    return {
      pares,
      soNoIxc: ixc.filter((_, k) => !usadoI.has(k)),
      soNoBanco: ban.filter((_, k) => !usadoE.has(k)).map((l) => Object.assign({}, l, { classificacao: classificarExtrato(l) })),
      duplicados,
      duplicadosOfx,
      status
    };
  }

  return { parear, classificarExtrato, LIMITE_LOTE };
})();

/*
 * Processamento: pareamento automático em código (porta do historico/extrator-v0/extrator.js).
 * Toda soma e comparação fica aqui, nunca na IA. Valores em centavos.
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

  function parear(movimentacao, extrato) {
    const ixc = movimentacao.filter((l) => !l.conciliado);
    const ban = extrato.filter((l) => !l.conciliado);
    const pares = [];
    const usadoI = new Set(), usadoE = new Set();
    const livre = (ii, ei) => !usadoI.has(ii) && !usadoE.has(ei);
    const marcar = (tipo, ii, ei, ambiguo) => {
      pares.push({ tipo, ambiguo: !!ambiguo, ixc: ii.map((k) => ixc[k].id), extrato: [ban[ei].id] });
      ii.forEach((k) => usadoI.add(k)); usadoE.add(ei);
    };

    // 1) identificador
    ixc.forEach((i, ii) => ban.forEach((e, ei) => {
      if (!livre(ii, ei) || i.valor !== e.valor) return;
      if ((i.tx_id && i.tx_id === e.tx_id) || (i.documento && i.documento === e.documento)) marcar('identificador', [ii], ei);
    }));

    // 2) valor + data (D0 ou D+1) — marca ambíguo se houver mais de um candidato
    ixc.forEach((i, ii) => {
      if (usadoI.has(ii)) return;
      const cand = [];
      ban.forEach((e, ei) => {
        if (usadoE.has(ei) || i.valor !== e.valor) return;
        const d = dia(e.data) - dia(i.data);
        if (d >= 0 && d <= 1) cand.push(ei);
      });
      if (cand.length) marcar('valor + data', [ii], cand[0], cand.length > 1);
    });

    // 3) lote
    ban.forEach((e, ei) => {
      if (usadoE.has(ei) || e.valor <= 0) return;
      const cand = ixc.map((i, ii) => ({ i, ii })).filter((x) => {
        const d = dia(e.data) - dia(x.i.data);
        return !usadoI.has(x.ii) && x.i.valor > 0 && d >= 0 && d <= 1;
      }).slice(0, LIMITE_LOTE);
      for (let m = 1; m < (1 << cand.length); m++) {
        const sel = cand.filter((_, k) => m & (1 << k));
        if (sel.length < 2) continue;
        if (sel.reduce((a, x) => a + x.i.valor, 0) === e.valor) { marcar('lote', sel.map((x) => x.ii), ei); break; }
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

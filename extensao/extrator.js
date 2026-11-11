/*
 * Conciliação bancária com IA — extrator e pareamento
 * Base do content script da futura extensão (roda na tela Conciliação Manual do IXC).
 *
 * extrairGrade(seletor, prefixo) -> lê uma grade pelo atributo abbr (não pela posição da coluna)
 * parear(ixc, extrato)           -> casa o óbvio em código e devolve só as sobras para a IA
 *
 * Valores ficam em centavos (inteiros) para evitar erro de arredondamento.
 */
(function (global) {
  const GRADE_IXC = { seletor: '#grid_lancamentos_aba_3', prefixo: 'fn_movim_finan' };
  const GRADE_EXTRATO = { seletor: '#grid_lancamentos_OFX_3', prefixo: 'fn_extrato' };

  // "1.250,50" -> 1250.5
  function numeroBR(s) {
    s = (s || '').trim();
    return s ? Number(s.replace(/\./g, '').replace(',', '.')) : 0;
  }

  // "02/11/2026" -> número de dias (para comparar D+1)
  function dia(d) {
    const [dd, mm, aa] = (d || '').split('/');
    return Date.UTC(aa, mm - 1, dd) / 864e5;
  }

  function extrairGrade(seletor, prefixo) {
    const tabela = document.querySelector(seletor);
    if (!tabela) return [];
    return [...tabela.querySelectorAll('tbody tr')].map(tr => {
      const linha = {};
      tr.querySelectorAll('td[abbr^="' + prefixo + '."]').forEach(td => {
        const campo = td.getAttribute('abbr').split('.')[1];
        if (campo === 'conciliado') linha.conciliado = !td.querySelector('.fa-times');
        else linha[campo] = td.textContent.trim();
      });
      linha.credito = numeroBR(linha.credito);
      linha.debito = numeroBR(linha.debito);
      linha.valor = Math.round((linha.credito - linha.debito) * 100); // centavos, + entrada / - saída
      return linha;
    });
  }

  function extrairTela() {
    return {
      ixc: extrairGrade(GRADE_IXC.seletor, GRADE_IXC.prefixo),
      extrato: extrairGrade(GRADE_EXTRATO.seletor, GRADE_EXTRATO.prefixo),
    };
  }

  function parear(ixc, extrato) {
    const pares = [];
    const usadoI = new Set();
    const usadoE = new Set();
    const livre = (ii, ei) => !usadoI.has(ii) && !usadoE.has(ei);
    const marcar = (tipo, ii, ei) => {
      pares.push({ tipo, ixc: ii.map(k => ixc[k].id), extrato: [extrato[ei].id] });
      ii.forEach(k => usadoI.add(k));
      usadoE.add(ei);
    };

    // 1) mesmo valor + mesmo tx_id ou documento
    ixc.forEach((i, ii) => extrato.forEach((e, ei) => {
      if (!livre(ii, ei) || i.valor !== e.valor) return;
      if ((i.tx_id && i.tx_id === e.tx_id) || (i.documento && i.documento === e.documento)) marcar('id', [ii], ei);
    }));

    // 2) mesmo valor, banco no mesmo dia ou D+1
    ixc.forEach((i, ii) => extrato.forEach((e, ei) => {
      if (!livre(ii, ei) || i.valor !== e.valor) return;
      const dif = dia(e.data) - dia(i.data);
      if (dif >= 0 && dif <= 1) marcar('valor+data', [ii], ei);
    }));

    // 3) lote: um crédito do banco = soma de 2+ recebimentos do IXC (mesmo dia ou D-1)
    extrato.forEach((e, ei) => {
      if (usadoE.has(ei) || e.valor <= 0) return;
      const cand = ixc.map((i, ii) => ({ i, ii })).filter(x => {
        const dif = dia(e.data) - dia(x.i.data);
        return !usadoI.has(x.ii) && x.i.valor > 0 && dif >= 0 && dif <= 1;
      }).slice(0, 18); // limita a combinação (2^18)
      for (let m = 1; m < (1 << cand.length); m++) {
        const sel = cand.filter((_, k) => m & (1 << k));
        if (sel.length < 2) continue;
        if (sel.reduce((a, x) => a + x.i.valor, 0) === e.valor) { marcar('lote', sel.map(x => x.ii), ei); break; }
      }
    });

    // duplicados: mesmo documento mais de uma vez no IXC
    const porDoc = {};
    ixc.forEach(i => { if (i.documento) (porDoc[i.documento] = porDoc[i.documento] || []).push(i.id); });

    return {
      pares,
      so_no_ixc: ixc.filter((_, k) => !usadoI.has(k)),
      so_no_banco: extrato.filter((_, k) => !usadoE.has(k)),
      possiveis_duplicados: Object.entries(porDoc).filter(([, ids]) => ids.length > 1).map(([documento, ids]) => ({ documento, ids })),
    };
  }

  global.ConciliaIA = { extrairGrade, extrairTela, parear, numeroBR };
})(typeof window !== 'undefined' ? window : globalThis);

/*
 * Processamento de indicadores, sempre calculados a partir dos dados (nada fixo na tela).
 */
Lolla.domain.indicadores = (function () {
  function daConciliacao({ movimentacao, extrato, pareamento }) {
    const pend = (arr) => arr.filter((l) => !l.conciliado);
    const soma = (arr) => arr.reduce((a, l) => a + l.valor, 0);
    const pIxc = pend(movimentacao), pBan = pend(extrato);
    const totalIxc = soma(pIxc), totalBanco = soma(pBan);

    const datas = Array.from(new Set(pIxc.concat(pBan).map((l) => l.data))).sort();
    const porDia = datas.map((data) => {
      const ixc = soma(pIxc.filter((l) => l.data === data));
      const banco = soma(pBan.filter((l) => l.data === data));
      return { data, ixc, banco, dif: ixc - banco };
    });

    const p = pareamento || { pares: [], soNoIxc: [], soNoBanco: [], duplicados: [] };
    const linhasPareadas = p.pares.reduce((a, x) => a + x.ixc.length + x.extrato.length, 0);
    const linhasPendentes = pIxc.length + pBan.length;
    const paresPorTipo = {};
    p.pares.forEach((x) => { paresPorTipo[x.tipo] = (paresPorTipo[x.tipo] || 0) + 1; });
    const sobrasPorClasse = {};
    p.soNoBanco.forEach((l) => { sobrasPorClasse[l.classificacao] = (sobrasPorClasse[l.classificacao] || 0) + 1; });

    return {
      totalIxc, totalBanco, diferenca: totalIxc - totalBanco,
      conciliadas: movimentacao.length + extrato.length - linhasPendentes,
      linhasTotais: movimentacao.length + extrato.length,
      linhasPendentes, linhasPareadas,
      taxaAutomatica: linhasPendentes ? linhasPareadas / linhasPendentes : 0,
      paresPorTipo, ambiguos: p.pares.filter((x) => x.ambiguo).length,
      sobrasIxc: p.soNoIxc.length, sobrasBanco: p.soNoBanco.length, sobrasPorClasse,
      duplicados: p.duplicados.length,
      porDia
    };
  }

  function deUso(historico, custoCfg) {
    const analises = historico || [];
    let aceitas = 0, rejeitadas = 0, sugestoes = 0, tokEnt = 0, tokSai = 0;
    const causas = {};
    analises.forEach((a) => {
      (a.resultado.itens || []).forEach((it, k) => {
        sugestoes++;
        causas[it.categoria || 'outra'] = (causas[it.categoria || 'outra'] || 0) + 1;
        const d = (a.decisoes || {})[k];
        if (d === 'aceita') aceitas++;
        if (d === 'rejeitada') rejeitadas++;
      });
      if (!a.simulado && a.usage) { tokEnt += a.usage.input_tokens || 0; tokSai += a.usage.output_tokens || 0; }
    });
    const usd = (tokEnt * custoCfg.precoEntradaUsd + tokSai * custoCfg.precoSaidaUsd) / 1e6;
    const reais = analises.filter((a) => !a.simulado).length;
    return {
      analises: analises.length,
      analisesReais: reais,
      simuladas: analises.length - reais,
      sugestoes, aceitas, rejeitadas,
      taxaAceite: aceitas + rejeitadas ? aceitas / (aceitas + rejeitadas) : 0,
      causas: Object.entries(causas).sort((a, b) => b[1] - a[1]),
      tokensEntrada: tokEnt, tokensSaida: tokSai,
      custoReaisCentavos: Math.round(usd * custoCfg.dolarEmReais * 100),
      custoMedioCentavos: reais ? Math.round((usd * custoCfg.dolarEmReais * 100) / reais) : 0
    };
  }

  return { daConciliacao, deUso };
})();

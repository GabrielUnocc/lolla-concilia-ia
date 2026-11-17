/*
 * Modo Análise — o que pode ir para a IA, e a conferência do que volta.
 * Vai SÓ: valores, datas, IDs técnicos (nosso número, ID do boleto/recebimento, FITID), categoria e
 * descrição do extrato mascarada. Nunca: nome, CPF/CNPJ, e-mail, linha original, conta, arquivo inteiro.
 * Só vão os itens que o motor marcou como "precisa de interpretação" (sobras e divergências sem explicação).
 * Antes do envio, uma segunda checagem procura CPF/CNPJ/e-mail e os nomes lidos dos arquivos no texto final:
 * se achar qualquer coisa, o envio é bloqueado.
 */
(function (g) {
  const L = g.Lolla;
  const A = L.domain.analise;

  const reais = (c) => (c == null || !isFinite(c) ? null : Number((c / 100).toFixed(2)));
  const mascarar = (t) => L.domain.mascaramento.mascararHistorico(t || '');
  const CERTEZAS = { alta: 'alta', alto: 'alta', media: 'media', 'média': 'media', medio: 'media', 'médio': 'media', baixa: 'baixa', baixo: 'baixa' };

  function linhaSegura(x) {
    if (!x) return null;
    const o = { ref: x.ref, origem: x.origem };
    if (x.origem === 'francesinha') {
      Object.assign(o, { nosso_numero: x.nossoNumeroBruto || x.nossoNumero, data_pagamento: x.dataPagamento || null, data_credito: x.dataCredito || null,
        valor_pago: reais(x.valorPago), valor_titulo: reais(x.valorTitulo) });
      if (x.tarifa != null) o.tarifa = reais(x.tarifa);
      if (x.seuNumero) o.seu_numero = x.seuNumero;
    } else if (x.origem === 'ofx') {
      Object.assign(o, { data: x.data, valor: reais(x.valor), categoria: x.categoria, descricao_mascarada: mascarar(x.descricao) });
      if (x.fitid) o.fitid = x.fitid;
      if (x.documento) o.documento = x.documento;
    } else {
      Object.assign(o, { data_pagamento: x.dataPagamento, valor_recebido: reais(x.valorRecebido) });
      if (x.dataCredito) o.data_credito = x.dataCredito;
      if (x.nossoNumeroBruto) o.nosso_numero = x.nossoNumeroBruto;
      if (x.idBoleto) o.id_boleto = x.idBoleto;
      if (x.idRecebimento) o.id_recebimento = x.idRecebimento;
      if (x.forma) o.forma_mascarada = mascarar(x.forma);
    }
    Object.keys(o).forEach((k) => { if (o[k] == null || o[k] === '') delete o[k]; });
    return o;
  }

  function montarPayload(analise, opcoes = {}) {
    const max = opcoes.maxItensPorParte || 40;
    const idx = A.resultado.indexar(analise);
    const selecionados = analise.itens.filter((i) => i.precisaIa && (!opcoes.ids || opcoes.ids.includes(i.id)));
    const s = analise.resumo;
    const contexto = {
      banco: s.banco,
      periodo: s.periodo,
      regra_credito_do_banco: analise.banco ? analise.banco.credito : null,
      resumo_do_codigo: { conciliados: s.correspondencias, atencao: s.atencao, divergencias: s.divergencias, sem_correspondencia: s.semCorrespondencia,
        titulos_francesinha: s.qtd.francesinha, lancamentos_ofx: s.qtd.ofx, recebimentos_ixc: s.qtd.ixc },
      legenda: { 'F:n': 'linha da francesinha (PDF do banco)', 'E:n': 'lançamento do extrato OFX', 'R:n': 'linha do relatório de recebimentos do IXC' }
    };
    const itens = selecionados.map((i) => {
      const refs = [].concat(i.refs.francesinha, i.refs.ofx, i.refs.ixc);
      const o = {
        id: i.id, classificacao_do_codigo: A.motor.CLASSIFICACOES[i.classificacao], regra: i.regra, etapa: i.etapa,
        diferenca: reais(i.valores && i.valores.diferenca),
        linhas: refs.map((r) => linhaSegura(idx.get(r))).filter(Boolean)
      };
      if (i.contexto && i.contexto.ofx && i.contexto.ofx.length) o.credito_ofx_do_titulo = i.contexto.ofx;
      return o;
    });
    const partes = [];
    for (let k = 0; k < itens.length; k += max) partes.push({ contexto, parte: { numero: partes.length + 1 }, itens: itens.slice(k, k + max) });
    partes.forEach((p) => { p.parte.de = partes.length; });
    return { partes, ids: selecionados.map((i) => i.id), totalItens: itens.length, totalLinhas: itens.reduce((a, i) => a + i.linhas.length, 0) };
  }

  /* ---------- Conferência final (defesa em profundidade) ---------- */
  const RE_CPF = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/;
  const RE_CNPJ = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/;
  const RE_EMAIL = /[^\s"@]+@[^\s"@]+\.[a-z]{2,}/i;
  const RE_FONE = /\(\d{2}\)\s?9?\d{4}-?\d{4}/;
  const CHAVES_PROIBIDAS = ['bruto', 'pessoais', 'nome', 'cliente', 'cpf', 'cnpj', 'sacado', 'pagador', 'email', 'conta', 'arquivo'];

  function nomesConhecidos(analise) {
    const nomes = new Set();
    const add = (v) => {
      const c = A.norm.chaveTexto(v);
      c.split(' ').filter((w) => w.length >= 4 && !/^\d+$/.test(w)).forEach((w) => nomes.add(w));
    };
    (analise.registros.francesinha || []).forEach((f) => (f.pessoais || []).forEach(add));
    (analise.registros.ixc || []).forEach((r) => Object.entries(r.bruto || {}).forEach(([cab, v]) => { if (A.leitorRecebimentos.ehPessoal(cab)) add(v); }));
    // Palavras técnicas que também aparecem em nomes de empresas não contam como vazamento
    ['PAGAMENTO', 'RECEBIDO', 'RECEBIMENTO', 'COBRANCA', 'LIQUIDACAO', 'BOLETO', 'TARIFA', 'CREDITO', 'DEBITO', 'TRANSFERENCIA', 'ESTORNO', 'PROVEDOR', 'INTERNET', 'TELECOM', 'LTDA'].forEach((w) => nomes.delete(w));
    return nomes;
  }

  function verificarPayload(partes, analise) {
    const problemas = [];
    const nomes = nomesConhecidos(analise);
    partes.forEach((p, k) => {
      const json = JSON.stringify(p);
      if (RE_CPF.test(json)) problemas.push(`Parte ${k + 1}: contém algo com formato de CPF`);
      if (RE_CNPJ.test(json)) problemas.push(`Parte ${k + 1}: contém algo com formato de CNPJ`);
      if (RE_EMAIL.test(json)) problemas.push(`Parte ${k + 1}: contém um e-mail`);
      if (RE_FONE.test(json)) problemas.push(`Parte ${k + 1}: contém um telefone`);
      const chavesUsadas = json.match(/"([a-z_]+)":/g) || [];
      chavesUsadas.map((c) => c.slice(1, -2)).filter((c) => CHAVES_PROIBIDAS.includes(c)).forEach((c) => problemas.push(`Parte ${k + 1}: campo proibido "${c}"`));
      const palavras = new Set(A.norm.chaveTexto(json).split(' '));
      const vazou = Array.from(nomes).filter((n) => palavras.has(n));
      if (vazou.length) problemas.push(`Parte ${k + 1}: contém ${vazou.length} palavra(s) que aparecem em nomes de clientes nos arquivos`);
    });
    return { ok: problemas.length === 0, problemas };
  }

  /* ---------- Conferência da resposta da IA ---------- */
  function validarResposta(resp, parte) {
    const problemas = [];
    const ids = new Set(parte.itens.map((i) => i.id));
    const refsPorItem = new Map(parte.itens.map((i) => [i.id, new Set(i.linhas.map((l) => l.ref).concat(i.credito_ofx_do_titulo || []))]));
    const todasRefs = new Set(parte.itens.flatMap((i) => i.linhas.map((l) => l.ref)));
    const itens = [];
    const lista = resp && Array.isArray(resp.itens) ? resp.itens : null;
    if (!lista) return { itens, problemas: ['A IA não devolveu a lista "itens" no formato esperado.'], observacoes: '' };
    const txt = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    lista.forEach((r) => {
      if (!r || !ids.has(r.id)) { problemas.push(`Resposta para item inexistente (${r && r.id}) descartada.`); return; }
      const linhas = Array.isArray(r.linhas) ? r.linhas.map(String) : [];
      const inventadas = linhas.filter((x) => !todasRefs.has(x) && !refsPorItem.get(r.id).has(x));
      if (inventadas.length) problemas.push(`Item ${r.id}: a IA citou linhas que não foram enviadas (${inventadas.join(', ')}); foram removidas.`);
      const certeza = CERTEZAS[String(r.certeza || '').toLowerCase()];
      if (!certeza) problemas.push(`Item ${r.id}: grau de certeza ausente ou inválido; considerado "baixa".`);
      const causa = txt(r.causa_provavel, 300), expl = txt(r.explicacao, 1200), passo = txt(r.proximo_passo, 600);
      if (!causa || !passo) problemas.push(`Item ${r.id}: resposta incompleta (sem causa ou próximo passo).`);
      itens.push({ id: r.id, causa_provavel: causa || '(não informada)', linhas: linhas.filter((x) => !inventadas.includes(x)), explicacao: expl,
        proximo_passo: passo || '(não informado)', certeza: certeza || 'baixa', pergunta_ao_cliente: txt(r.pergunta_ao_cliente, 400) || '' });
    });
    const respondidos = new Set(itens.map((i) => i.id));
    parte.itens.filter((i) => !respondidos.has(i.id)).forEach((i) => problemas.push(`A IA não respondeu o item ${i.id}.`));
    return { itens, problemas, observacoes: txt(resp.observacoes_gerais, 800) };
  }

  A.privacidadeIa = { montarPayload, verificarPayload, validarResposta, linhaSegura };
})(typeof self !== 'undefined' ? self : globalThis);

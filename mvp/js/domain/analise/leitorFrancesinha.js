/*
 * Modo Análise — leitor da francesinha (PDF com camada de texto).
 * Parte pura: recebe os textos posicionados de cada página (x, y, str) e o layout do banco
 * (âncoras do cabeçalho). A extração do PDF em si fica em services/pdfTexto.js (pdf.js).
 *
 * Método (o mesmo da ferramenta Conciliacao, validado com PDFs reais do Sicoob):
 *   1. agrupa os textos em linhas pela coordenada y;
 *   2. acha a linha de cabeçalho (pelo menos metade das âncoras);
 *   3. define a faixa horizontal de cada coluna pelo ponto médio entre as âncoras;
 *   4. cada linha abaixo do cabeçalho com nosso número numérico e valor vira um título.
 * PDF sem texto (escaneado) ou layout não reconhecido -> erro explícito, nunca leitura vazia "válida".
 */
(function (g) {
  const A = g.Lolla.domain.analise;

  const RE_VALOR = /-?\d{1,3}(?:\.\d{3})*,\d{2}(?!\d)/;
  const RE_DATA = /\d{2}\/\d{2}\/(?:\d{4}|\d{2})(?!\d)/;
  const RE_NN = /^[\d][\d.\-/ ]*[\dXxPp]?$/;

  class ErroLeitura extends Error {
    constructor(codigo, msg) { super(msg); this.codigo = codigo; }
  }

  // Agrupa textos soltos em linhas (tolerância de 2 unidades no y), de cima para baixo e da esquerda para a direita
  function agruparLinhas(itens, tolerancia = 2) {
    const ordenados = itens.filter((i) => i && String(i.str).trim() !== '').slice().sort((a, b) => b.y - a.y || a.x - b.x);
    const linhas = [];
    ordenados.forEach((it) => {
      const ult = linhas[linhas.length - 1];
      if (ult && Math.abs(ult.y - it.y) <= tolerancia) ult.itens.push(it);
      else linhas.push({ y: it.y, itens: [it] });
    });
    linhas.forEach((l) => l.itens.sort((a, b) => a.x - b.x));
    return linhas;
  }

  const chave = (s) => A.norm.chaveTexto(s).toLowerCase();
  const textoLinha = (l) => l.itens.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();

  function acharCabecalho(linhas, ancoras) {
    let melhor = null, melhorPontos = 0;
    const limite = Math.min(linhas.length, 40);
    for (let i = 0; i < limite; i++) {
      const t = chave(textoLinha(linhas[i]));
      const pontos = ancoras.filter((a) => a && t.includes(chave(a))).length;
      if (pontos > melhorPontos) { melhorPontos = pontos; melhor = linhas[i]; }
    }
    return melhorPontos >= Math.ceil(ancoras.length * 0.5) ? melhor : null;
  }

  function limitesColunas(cabecalho, ancoras) {
    const achadas = [], usados = new Set();
    ancoras.forEach((anc) => {
      const na = chave(anc);
      const idx = cabecalho.itens.findIndex((it, k) => !usados.has(k) && chave(it.str).includes(na));
      if (idx >= 0) { usados.add(idx); achadas.push({ ancora: anc, x: cabecalho.itens[idx].x }); }
    });
    achadas.sort((a, b) => a.x - b.x);
    return achadas.map((f, i) => ({
      ancora: f.ancora,
      ini: i === 0 ? -Infinity : (achadas[i - 1].x + f.x) / 2,
      fim: i === achadas.length - 1 ? Infinity : (f.x + achadas[i + 1].x) / 2
    }));
  }

  const celula = (linha, limites, ancora) => {
    const b = ancora && limites.find((x) => x.ancora === ancora);
    if (!b) return '';
    return linha.itens.filter((it) => it.x >= b.ini && it.x < b.fim).map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim();
  };

  function verificarTexto(paginas) {
    const totalCaracteres = paginas.reduce((a, p) => a + p.reduce((b, it) => b + String(it.str || '').trim().length, 0), 0);
    if (totalCaracteres < 20) {
      throw new ErroLeitura('sem_texto', 'O PDF não tem texto extraível (provavelmente é escaneado/imagem). Esta versão não faz OCR: peça ao cliente a francesinha gerada direto pelo internet banking.');
    }
  }

  // Texto corrido do PDF (só para identificar o banco; não sai do navegador)
  function textoCorrido(paginas) {
    verificarTexto(paginas);
    return paginas.map((itens) => agruparLinhas(itens).map(textoLinha).join('\n')).join('\n');
  }

  /*
   * paginas: [[{x, y, str}]]  (textos crus de cada página)
   * layout : banco.francesinha  ({ colunas, campos })
   */
  function interpretar(paginas, layout, nomeArquivo) {
    const norm = A.norm;
    verificarTexto(paginas);
    if (!layout || !layout.colunas || !layout.campos) {
      throw new ErroLeitura('sem_layout', 'Ainda não há leitor de francesinha para este banco. OFX e relatório do IXC podem ser cruzados entre si (etapa C).');
    }
    const c = layout.campos;
    const registros = [], ignoradas = [], totaisImpressos = [], textoPaginas = [];
    let limites = null, cabecalhosAchados = 0;

    paginas.forEach((itens, p) => {
      const linhas = agruparLinhas(itens);
      textoPaginas.push(linhas.map(textoLinha).join('\n'));
      const cab = acharCabecalho(linhas, layout.colunas);
      if (cab) { limites = limitesColunas(cab, layout.colunas); cabecalhosAchados++; }
      if (!limites) return;
      linhas.forEach((linha, k) => {
        if (cab && linha.y >= cab.y) return;                     // acima do cabeçalho (ou o próprio cabeçalho)
        const txt = textoLinha(linha);
        const nnTxt = celula(linha, limites, c.nossoNumero);
        if (/\bTOTA(L|IS)\b/.test(norm.chaveTexto(txt))) {
          const valores = (txt.match(new RegExp(RE_VALOR.source, 'g')) || []).map(norm.centavos);
          if (valores.length) totaisImpressos.push({ pagina: p + 1, texto: txt, valores });
          return;
        }
        if (!nnTxt || !/\d/.test(nnTxt) || !RE_NN.test(nnTxt)) return;   // não é linha de título (rodapé, título do relatório…)
        const v = (campo) => { const m = celula(linha, limites, c[campo]).match(RE_VALOR); return m ? norm.centavos(m[0]) : null; };
        const d = (campo) => { const m = celula(linha, limites, c[campo]).match(RE_DATA); return m ? norm.data(m[0]) : ''; };
        const nn = norm.nossoNumero(nnTxt);
        const reg = {
          ref: 'F:' + (registros.length + 1),
          origem: 'francesinha',
          pagina: p + 1,
          linha: k + 1,
          nossoNumero: nn.chave,
          nossoNumeroBruto: nn.bruto,
          nossoNumeroSemUltimo: nn.semUltimo,
          seuNumero: c.seuNumero ? norm.id(celula(linha, limites, c.seuNumero)) : '',
          valorTitulo: v('valorTitulo'),
          valorPago: v('valorPago'),
          tarifa: c.tarifa ? v('tarifa') : null,
          mora: v('mora'), desconto: v('desconto'), outros: v('outros'),
          dataPagamento: d('dataPagamento'),
          dataCredito: d('dataCredito'),
          vencimento: d('vencimento'),
          bruto: txt,
          // Nome do pagador etc.: guardado só para conferir que nada disso vai para a IA
          pessoais: (layout.colunasPessoais || []).map((anc) => celula(linha, limites, anc)).filter((x) => x && x.length >= 3)
        };
        const faltando = [];
        if (!reg.nossoNumero) faltando.push('nosso número');
        if (reg.valorPago == null) faltando.push('valor pago');
        if (!reg.dataCredito && !reg.dataPagamento) faltando.push('data de crédito/pagamento');
        if (faltando.length) { ignoradas.push({ pagina: p + 1, linha: k + 1, motivo: 'sem ' + faltando.join(', '), texto: txt }); return; }
        registros.push(reg);
      });
    });

    if (!cabecalhosAchados) {
      throw new ErroLeitura('layout_nao_reconhecido', `Não encontrei o cabeçalho da francesinha (${layout.colunas.join(', ')}). Confira se é o relatório de títulos liquidados do banco certo ou ajuste as colunas.`);
    }
    if (!registros.length) {
      throw new ErroLeitura('sem_titulos', ignoradas.length
        ? `Encontrei o cabeçalho, mas nenhuma linha completa (${ignoradas.length} linha(s) com dados faltando).`
        : 'Encontrei o cabeçalho, mas nenhum título liquidado no PDF.');
    }

    const textoCompleto = textoPaginas.join('\n');
    const per = norm.chaveTexto(textoCompleto).match(/PERIODO\D{0,30}?(\d{2}) (\d{2}) (\d{4}) (?:A|ATE|E) (\d{2}) (\d{2}) (\d{4})/);
    const periodo = per ? { inicio: norm.data(`${per[1]}/${per[2]}/${per[3]}`), fim: norm.data(`${per[4]}/${per[5]}/${per[6]}`) } : null;

    const avisos = [];
    if (ignoradas.length) avisos.push({ tipo: 'linhas_incompletas', texto: `${ignoradas.length} linha(s) da francesinha com dados faltando não entraram no cruzamento (veja "Linhas não lidas")` });
    const semCredito = registros.filter((r) => !r.dataCredito).length;
    if (semCredito) avisos.push({ tipo: 'sem_data_credito', texto: `${semCredito} título(s) sem data de crédito: ficam fora do cruzamento com o OFX (etapa B)` });
    const soma = registros.reduce((a, r) => a + r.valorPago, 0);
    const somaTitulo = registros.reduce((a, r) => a + (r.valorTitulo || 0), 0);
    const conferencia = totaisImpressos.length
      ? { soma, confere: totaisImpressos.some((t) => t.valores.includes(soma) || t.valores.includes(somaTitulo)) }
      : null;
    if (conferencia && !conferencia.confere) avisos.push({ tipo: 'total_nao_confere', texto: `A soma lida (R$ ${norm.reais(soma)}) não aparece nas linhas de total do PDF: confira se alguma linha não foi lida` });

    return { tipo: 'francesinha', arquivo: nomeArquivo || '', paginas: paginas.length, registros, ignoradas, avisos, totaisImpressos, conferencia, periodo, textoCompleto };
  }

  A.leitorFrancesinha = { interpretar, textoCorrido, agruparLinhas, ErroLeitura };
})(typeof self !== 'undefined' ? self : globalThis);

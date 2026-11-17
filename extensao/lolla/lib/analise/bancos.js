/*
 * Modo Análise — registro de bancos.
 * Cada banco é um módulo próprio (pasta bancos/) que se registra aqui com:
 *   id, nome, codigos (COMPE), status ('completo' | 'pendente'),
 *   assinaturas      : trechos que identificam a francesinha do banco (comparados com chaveTexto)
 *   francesinha      : layout de colunas do PDF (âncoras do cabeçalho) ou null se ainda não há amostra
 *   credito          : como o banco credita a cobrança no extrato (lote/individual, dias de tolerância, tarifa)
 *   regrasOfx        : regras de descrição do extrato específicas do banco (issue #7), antes das genéricas
 * Regra de ouro: nada específico de banco fica na interface nem no motor; fica no módulo do banco.
 */
(function (g) {
  const L = g.Lolla = g.Lolla || { core: {}, services: {}, domain: {}, ui: {} };
  const A = L.domain.analise = L.domain.analise || {};
  const registro = new Map();

  const PADRAO_CREDITO = {
    modo: 'auto',            // 'lote' (soma do dia), 'individual' (um crédito por boleto) ou 'auto' (tenta os dois)
    toleranciaDias: 2,       // aceita crédito até D+N da data de crédito informada na francesinha
    tarifa: 'desconhecida'   // 'descontada' (crédito líquido), 'separada' (débito à parte) ou 'desconhecida' (tenta as duas)
  };

  function registrar(def) {
    if (!def || !def.id || !def.nome) throw new Error('Banco sem id/nome');
    const b = Object.assign({ codigos: [], status: 'pendente', assinaturas: [], francesinha: null, regrasOfx: [], pendencias: [] }, def);
    b.credito = Object.assign({}, PADRAO_CREDITO, def.credito);
    registro.set(b.id, b);
    return b;
  }

  const obter = (id) => registro.get(id) || null;
  const lista = () => Array.from(registro.values());
  const porCodigo = (cod) => {
    const c = String(cod || '').replace(/\D/g, '').replace(/^0+(?=\d{3})/, '').padStart(3, '0');
    return lista().find((b) => b.codigos.includes(c)) || null;
  };

  /*
   * Detecta o banco pelos arquivos. Pesos: código do OFX (3), assinatura da francesinha (2), nome na coluna conta do IXC (1).
   * Devolve o melhor candidato, as evidências e se há conflito entre os arquivos.
   */
  function detectar({ ofx, textoFrancesinha, contasIxc } = {}) {
    const chave = A.norm.chaveTexto;
    const pontos = new Map();
    const evidencias = [];
    const somar = (b, p, ev) => { pontos.set(b.id, (pontos.get(b.id) || 0) + p); evidencias.push(Object.assign({ banco: b.id }, ev)); };
    let peloOfx = null, pelaFrancesinha = null;

    if (ofx && ofx.conta && ofx.conta.bancoCodigo) {
      const b = porCodigo(ofx.conta.bancoCodigo);
      if (b) { peloOfx = b.id; somar(b, 3, { fonte: 'ofx', detalhe: `Código do banco no OFX: ${ofx.conta.bancoCodigo}` }); }
      else evidencias.push({ banco: null, fonte: 'ofx', detalhe: `Código ${ofx.conta.bancoCodigo} no OFX não está entre os bancos contemplados` });
    }
    if (textoFrancesinha) {
      const t = ' ' + chave(textoFrancesinha) + ' ';
      let melhor = null, melhorQtd = 0;
      lista().forEach((b) => {
        const achadas = b.assinaturas.filter((a) => t.includes(' ' + a + ' ') || t.includes(a));
        if (achadas.length > melhorQtd) { melhor = b; melhorQtd = achadas.length; }
        if (achadas.length) somar(b, 2, { fonte: 'francesinha', detalhe: `Texto da francesinha contém: ${achadas.slice(0, 3).join(', ')}` });
      });
      if (melhor) pelaFrancesinha = melhor.id;
    }
    if (contasIxc && contasIxc.length) {
      const t = ' ' + chave(contasIxc.join(' ')) + ' ';
      lista().forEach((b) => {
        const nomes = [chave(b.nome)].concat(b.apelidos || []);
        const achado = nomes.find((n) => n && t.includes(' ' + n + ' '));
        if (achado) somar(b, 1, { fonte: 'ixc', detalhe: `Coluna conta do relatório IXC menciona "${achado}"` });
      });
    }
    const ordem = Array.from(pontos.entries()).sort((a, b) => b[1] - a[1]);
    const id = ordem.length ? ordem[0][0] : null;
    const conflito = !!(peloOfx && pelaFrancesinha && peloOfx !== pelaFrancesinha);
    const confianca = !id ? 'nenhuma' : conflito ? 'baixa' : (peloOfx && pelaFrancesinha) ? 'alta' : 'media';
    return { id, confianca, conflito, peloOfx, pelaFrancesinha, evidencias };
  }

  A.bancos = { registrar, obter, lista, porCodigo, detectar, PADRAO_CREDITO };
})(typeof self !== 'undefined' ? self : globalThis);

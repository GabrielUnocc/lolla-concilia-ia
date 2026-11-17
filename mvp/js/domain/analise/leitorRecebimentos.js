/*
 * Modo Análise — leitor do relatório de recebimentos do IXC (CSV, XLS, XLSX).
 * Não assume posição fixa de coluna: procura o cabeçalho e sugere o mapeamento pelos nomes.
 * O analista pode trocar o mapeamento na tela (ex.: quando o nosso número vem com outro nome).
 * Colunas pessoais (cliente, CPF/CNPJ…) são reconhecidas e nunca entram nos dados do cruzamento;
 * aparecem só na "linha original", que não sai do navegador.
 *
 * PENDENTE: confirmar com um relatório real do IXC o nome exato da coluna do nosso número
 * e se a data é de pagamento ou de crédito. Os sinônimos abaixo cobrem as variações conhecidas.
 */
(function (g) {
  const A = g.Lolla.domain.analise;

  const CAMPOS = {
    nossoNumero:   { rotulo: 'Nosso número', sinonimos: ['nosso numero', 'nosso n', 'nossonumero', 'nosso num', 'nn'] },
    idBoleto:      { rotulo: 'ID do boleto', sinonimos: ['id boleto', 'id do boleto', 'id fatura', 'id receber', 'id a receber', 'id areceber', 'id titulo', 'id do titulo', 'boleto', 'fatura', 'titulo'] },
    idRecebimento: { rotulo: 'ID do recebimento', sinonimos: ['id recebimento', 'id do recebimento', 'codigo recebimento', 'id movimento', 'id movimentacao', 'id lancamento', 'id movim', 'id'] },
    valorRecebido: { rotulo: 'Valor recebido', sinonimos: ['valor recebido', 'vlr recebido', 'valor pago', 'vlr pago', 'total recebido', 'valor liquido', 'liquido', 'valor baixa', 'valor da baixa', 'valor', 'vlr'], excluir: ['original', 'titulo', 'boleto', 'desconto', 'juros', 'multa', 'acrescimo', 'tarifa', 'documento', 'vencimento', 'aberto'] },
    dataPagamento: { rotulo: 'Data de pagamento', sinonimos: ['data pagamento', 'data do pagamento', 'dt pagamento', 'data pgto', 'pagamento', 'data recebimento', 'data do recebimento', 'recebimento', 'data baixa', 'data da baixa', 'data'], excluir: ['venc', 'vencimento', 'emissao', 'credito', 'cadastro', 'geracao'] },
    dataCredito:   { rotulo: 'Data de crédito', sinonimos: ['data credito', 'data de credito', 'dt credito', 'credito em', 'data do credito'] },
    conta:         { rotulo: 'Conta', sinonimos: ['conta', 'conta bancaria', 'conta caixa', 'portador', 'carteira', 'banco'] },
    forma:         { rotulo: 'Forma / tipo', sinonimos: ['forma pagamento', 'forma de pagamento', 'tipo recebimento', 'tipo de recebimento', 'meio pagamento', 'origem', 'tipo'] }
  };
  const OBRIGATORIOS = ['valorRecebido', 'dataPagamento'];
  const UM_DOS_IDS = ['nossoNumero', 'idBoleto', 'idRecebimento'];
  const PESSOAIS = ['cliente', 'razao', 'razao social', 'nome', 'cpf', 'cnpj', 'cpf cnpj', 'sacado', 'pagador', 'email', 'e mail', 'telefone', 'celular', 'endereco'];

  const ch = (s) => A.norm.chaveTexto(s).toLowerCase();

  function nota(cabecalho, sinonimos, excluir) {
    const c = ch(cabecalho);
    if (!c) return 0;
    if ((excluir || []).some((x) => (' ' + c + ' ').includes(' ' + x))) return 0;
    let melhor = 0;
    sinonimos.forEach((s, k) => {
      const peso = 1 - k / (sinonimos.length * 4);           // sinônimos do começo da lista valem um pouco mais
      if (c === s) melhor = Math.max(melhor, 3 * peso);
      else if (s.length > 2 && (' ' + c + ' ').includes(' ' + s + ' ')) melhor = Math.max(melhor, 2 * peso);
    });
    return melhor;
  }

  const ehPessoal = (cab) => { const c = ch(cab); return PESSOAIS.some((p) => c === p || (' ' + c + ' ').includes(' ' + p + ' ')); };

  // Sugere o mapeamento para uma linha de cabeçalho: cada campo pega a melhor coluna livre
  function sugerirMapa(cabecalho) {
    const pares = [];
    Object.entries(CAMPOS).forEach(([campo, def]) => cabecalho.forEach((cab, col) => {
      if (ehPessoal(cab)) return;
      const n = nota(cab, def.sinonimos, def.excluir);
      if (n > 0) pares.push({ campo, col, n });
    }));
    pares.sort((a, b) => b.n - a.n);
    const mapa = {}, usadas = new Set();
    pares.forEach((p) => { if (mapa[p.campo] == null && !usadas.has(p.col)) { mapa[p.campo] = p.col; usadas.add(p.col); } });
    const total = Object.keys(mapa).reduce((a, c) => a + pares.find((p) => p.campo === c && p.col === mapa[c]).n, 0);
    return { mapa, pontos: total };
  }

  function acharCabecalho(linhas) {
    let melhor = { linha: -1, pontos: 0, mapa: {} };
    linhas.slice(0, 25).forEach((l, i) => {
      const s = sugerirMapa(l.map((c) => String(c)));
      if (Object.keys(s.mapa).length >= 2 && s.pontos > melhor.pontos) melhor = { linha: i, pontos: s.pontos, mapa: s.mapa };
    });
    return melhor;
  }

  function validarMapa(mapa) {
    const faltam = OBRIGATORIOS.filter((c) => mapa[c] == null).map((c) => CAMPOS[c].rotulo);
    if (!UM_DOS_IDS.some((c) => mapa[c] != null)) faltam.push('nosso número, ID do boleto ou ID do recebimento (pelo menos um)');
    const cols = Object.values(mapa).filter((v) => v != null);
    const repetidas = cols.filter((v, i) => cols.indexOf(v) !== i);
    return { ok: !faltam.length && !repetidas.length, faltam, repetidas };
  }

  /*
   * linhas: matriz da planilha (aba escolhida)
   * opcoes: { linhaCabecalho, mapa, conta } — se omitidos, usa a sugestão automática
   */
  function interpretar(linhas, opcoes = {}, nomeArquivo) {
    const norm = A.norm;
    const auto = acharCabecalho(linhas);
    const linhaCab = opcoes.linhaCabecalho != null ? opcoes.linhaCabecalho : auto.linha;
    if (linhaCab < 0 || !linhas[linhaCab]) {
      return { tipo: 'recebimentos', arquivo: nomeArquivo || '', status: 'sem_cabecalho', mensagem: 'Não encontrei a linha de cabeçalho (com nomes como "Valor", "Data", "Nosso número"). Escolha a linha e as colunas manualmente.', cabecalho: [], mapa: {}, registros: [], ignoradas: [], avisos: [] };
    }
    const cabecalho = linhas[linhaCab].map((c, k) => String(c).trim() || `Coluna ${k + 1}`);
    const mapa = Object.assign({}, opcoes.mapa || (opcoes.linhaCabecalho != null ? sugerirMapa(cabecalho).mapa : auto.mapa));
    Object.keys(mapa).forEach((k) => { if (mapa[k] == null || mapa[k] === '' || mapa[k] < 0) delete mapa[k]; else mapa[k] = Number(mapa[k]); });
    const pessoais = cabecalho.map((c, k) => (ehPessoal(c) ? k : -1)).filter((k) => k >= 0);
    const validacao = validarMapa(mapa);
    const base = { tipo: 'recebimentos', arquivo: nomeArquivo || '', linhaCabecalho: linhaCab, cabecalho, mapa, pessoais, validacao, campos: CAMPOS };
    if (!validacao.ok) {
      return Object.assign(base, { status: 'mapeamento_incompleto', mensagem: 'Confirme as colunas: ' + validacao.faltam.concat(validacao.repetidas.length ? ['há colunas usadas em mais de um campo'] : []).join('; '), registros: [], ignoradas: [], avisos: [] });
    }

    const registros = [], ignoradas = [], totais = [];
    let foraDoFiltro = 0;
    const todasContas = new Set();
    const cel = (l, campo) => (mapa[campo] != null ? l[mapa[campo]] : '');
    for (let i = linhaCab + 1; i < linhas.length; i++) {
      const l = linhas[i];
      if (!l || !l.some((c) => String(c).trim() !== '')) continue;
      const numLinha = i + 1;
      const bruto = {};
      cabecalho.forEach((c, k) => { if (l[k] !== '' && l[k] != null) bruto[c] = l[k]; });
      const valor = norm.centavos(cel(l, 'valorRecebido'));
      const data = norm.data(cel(l, 'dataPagamento'));
      const nn = norm.nossoNumero(cel(l, 'nossoNumero'));
      const idB = norm.id(cel(l, 'idBoleto')), idR = norm.id(cel(l, 'idRecebimento'));
      const temId = nn.chave || idB || idR;
      if (!temId && l.some((c) => /\btota(l|is)\b/i.test(String(c)))) { totais.push({ linha: numLinha, valor }); continue; }
      const faltando = [];
      if (!isFinite(valor)) faltando.push('valor válido');
      if (!data) faltando.push('data válida');
      if (!temId) faltando.push('identificador (nosso número / ID)');
      if (faltando.length) { ignoradas.push({ linha: numLinha, motivo: 'sem ' + faltando.join(', '), bruto }); continue; }
      const conta = norm.texto(cel(l, 'conta'));
      if (conta) todasContas.add(conta);
      if (opcoes.conta && conta !== opcoes.conta) { foraDoFiltro++; continue; }   // filtro explícito escolhido pelo analista (contado e avisado)
      registros.push({
        ref: 'R:' + numLinha,
        origem: 'ixc',
        linha: numLinha,
        idRecebimento: idR,
        idBoleto: idB,
        nossoNumero: nn.chave,
        nossoNumeroBruto: nn.bruto,
        nossoNumeroSemUltimo: nn.semUltimo,
        valorRecebido: valor,
        dataPagamento: data,
        dataCredito: norm.data(cel(l, 'dataCredito')),
        conta,
        forma: norm.texto(cel(l, 'forma')),
        bruto
      });
    }
    const avisos = [];
    if (ignoradas.length) avisos.push({ tipo: 'linhas_incompletas', texto: `${ignoradas.length} linha(s) do relatório sem valor, data ou identificador não entraram no cruzamento (veja "Linhas não lidas")` });
    if (foraDoFiltro) avisos.push({ tipo: 'filtro_conta', texto: `${foraDoFiltro} recebimento(s) de outras contas ficaram fora pelo filtro "${opcoes.conta}"` });
    const contas = Array.from(todasContas);
    if (contas.length > 1 && !opcoes.conta) avisos.push({ tipo: 'varias_contas', texto: `O relatório tem ${contas.length} contas (${contas.slice(0, 4).join(', ')}${contas.length > 4 ? '…' : ''}). Filtre a conta do extrato para não gerar falsas divergências.` });
    const semNn = registros.filter((r) => !r.nossoNumero).length;
    if (mapa.nossoNumero == null) avisos.push({ tipo: 'sem_nosso_numero', texto: 'Nenhuma coluna de nosso número mapeada: o cruzamento com a francesinha (etapa A) não será possível. Confira o mapeamento.' });
    else if (semNn) avisos.push({ tipo: 'linhas_sem_nn', texto: `${semNn} recebimento(s) sem nosso número (PIX, dinheiro, baixa manual…): vão direto para o cruzamento com o OFX (etapa C)` });
    if (!registros.length) {
      return Object.assign(base, { status: 'sem_registros', mensagem: ignoradas.length ? `Nenhuma linha válida: ${ignoradas.length} linha(s) com dados faltando. Confira o mapeamento das colunas.` : 'Nenhum recebimento abaixo do cabeçalho.', registros, ignoradas, avisos, contas });
    }
    return Object.assign(base, { status: 'ok', registros, ignoradas, avisos, totais, contas });
  }

  A.leitorRecebimentos = { interpretar, sugerirMapa, acharCabecalho, validarMapa, CAMPOS, ehPessoal };
})(typeof self !== 'undefined' ? self : globalThis);

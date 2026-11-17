/*
 * Modo Análise — motor de conciliação determinístico.
 * Quem decide o que corresponde a quê é SEMPRE este código; a IA só interpreta o que sobrar.
 *
 *   Etapa A  francesinha × recebimentos IXC  — chave: nosso número (2ª tentativa sem DV; 3ª seu número = ID do boleto)
 *   Etapa B  francesinha × OFX               — chave: data de crédito; soma do dia (lote) ou título a título,
 *                                              bruta ou líquida de tarifa, até D+N (regra por banco)
 *   Etapa C  OFX × recebimentos IXC          — o que sobrou, com o pareamento existente (identificador, valor+D+1, lote ≤18)
 *   Etapa D  classificação final              — duplicados, sobras, saídas fora do escopo e conferência de cobertura
 *
 * Cada item do resultado tem: classificação, status, regra aplicada, motivo (justificativa técnica com valores e datas)
 * e as refs das linhas de origem (F:n francesinha, E:n OFX, R:n linha do relatório IXC).
 * Se alguma linha lida não aparecer em nenhum item, o motor acusa erro (nada some em silêncio).
 */
(function (g) {
  const L = g.Lolla;
  const A = L.domain.analise;

  const CLASSIFICACOES = {
    conciliado: 'Conciliado',
    lote: 'Lote',
    tarifa: 'Tarifa',
    data: 'D+1 / data de crédito',
    duplicado: 'Duplicado',
    valor: 'Valor diferente',
    so_banco: 'Somente no banco',
    so_ixc: 'Somente no IXC',
    sem_correspondencia: 'Sem correspondência identificada'
  };

  // Grupos da tela de resultados (na ordem em que aparecem)
  const GRUPOS = [
    { id: 'conciliados', nome: 'Conciliados' },
    { id: 'valor', nome: 'Divergências de valor' },
    { id: 'tarifa', nome: 'Problemas de tarifa' },
    { id: 'data', nome: 'Diferenças de data' },
    { id: 'duplicado', nome: 'Registros duplicados' },
    { id: 'so_banco', nome: 'Somente no banco' },
    { id: 'so_ixc', nome: 'Somente no IXC' },
    { id: 'outros', nome: 'Outros casos não identificados' }
  ];

  function grupoDo(item) {
    if (item.status === 'ok') return 'conciliados';
    if (item.classificacao === 'sem_correspondencia' || item.classificacao === 'lote' || item.classificacao === 'conciliado') return 'outros';
    return item.classificacao;
  }

  const RE_MANUAL = /\b(MANUAL|DINHEIRO|ESPECIE|BALCAO|CHEQUE|CAIXA|DEPOSITO|CARTEIRA)\b/;

  function executar(entrada) {
    const norm = A.norm;
    const R$ = (c) => 'R$ ' + norm.reais(c);
    const br = norm.brDeIso;
    const banco = entrada.banco || null;
    const regraCredito = Object.assign({}, A.bancos.PADRAO_CREDITO, banco && banco.credito);
    const F = (entrada.francesinha || []).slice();
    const E = (entrada.ofx || []).map((e) => Object.assign({}, e, A.classificacaoOfx.classificar({ descricao: e.descricao, valor: e.valor }, banco)));
    const R = (entrada.ixc || []).slice();
    const tem = { F: !!entrada.francesinha, E: !!entrada.ofx, R: !!entrada.ixc };
    const etapas = [];
    const itens = [];
    const cont = { A: 0, B: 0, C: 0, D: 0 };
    const avisos = [];

    const soma = (arr, campo) => arr.reduce((a, x) => a + (x[campo] || 0), 0);
    function novoItem(etapa, dados) {
      const it = Object.assign({
        id: `${etapa}-${++cont[etapa]}`, etapa, status: 'divergente', precisaIa: false,
        refs: { francesinha: [], ofx: [], ixc: [] }, valores: {}, datas: {}, contexto: { ofx: [] }
      }, dados);
      it.grupo = grupoDo(it);
      itens.push(it);
      return it;
    }

    /* =================== ETAPA A — francesinha × IXC (nosso número) =================== */
    const pareadoF = new Map();   // ref F -> item A
    const pareadoR = new Map();   // ref R -> item A/C
    const naFrancesinhaPeriodo = (() => {
      const ds = F.map((f) => f.dataPagamento).concat(F.map((f) => f.dataCredito)).filter(Boolean).sort();
      return ds.length ? { ini: ds[0], fim: ds[ds.length - 1] } : null;
    })();

    function compararPar(f, r, regra, comoCasou) {
      const dv = r.valorRecebido - f.valorPago;
      const datasBanco = [f.dataPagamento, f.dataCredito].filter(Boolean);
      const dataIxc = r.dataCredito || r.dataPagamento;
      const dataOk = datasBanco.includes(r.dataPagamento) || (r.dataCredito && datasBanco.includes(r.dataCredito));
      const base = {
        refs: { francesinha: [f.ref], ofx: [], ixc: [r.ref] },
        valores: { francesinha: f.valorPago, ixc: r.valorRecebido, diferenca: dv },
        datas: { pagamento: f.dataPagamento, credito: f.dataCredito, ixc: dataIxc },
        chave: f.nossoNumero, regra
      };
      const quem = `${comoCasou} (francesinha ${f.nossoNumeroBruto || f.nossoNumero}${r.nossoNumeroBruto ? ', IXC ' + r.nossoNumeroBruto : r.idBoleto ? ', ID do boleto ' + r.idBoleto : ''})`;
      if (dv === 0 && dataOk) {
        return novoItem('A', Object.assign(base, { status: 'ok', classificacao: 'conciliado', titulo: 'Boleto pago e baixado corretamente',
          motivo: `${quem}; valor pago ${R$(f.valorPago)} = valor recebido no IXC; data da baixa (${br(dataIxc)}) igual à ${r.dataPagamento === f.dataPagamento ? 'data de pagamento' : 'data de crédito'} da francesinha.` }));
      }
      if (dv === 0) {
        const dias = norm.difDias(f.dataPagamento || f.dataCredito, r.dataPagamento);
        return novoItem('A', Object.assign(base, { status: 'divergente', classificacao: 'data', precisaIa: Math.abs(dias) > 3, titulo: 'Baixa com data diferente da francesinha',
          motivo: `${quem}; valores iguais (${R$(f.valorPago)}), mas a baixa no IXC é de ${br(r.dataPagamento)} e o banco registra pagamento em ${br(f.dataPagamento) || '—'} e crédito em ${br(f.dataCredito) || '—'} (${dias > 0 ? '+' : ''}${dias} dia(s)).`,
          acao: 'Conferir a data da baixa no IXC (data de pagamento × data de crédito) antes de conciliar.' }));
      }
      if (f.tarifa != null && r.valorRecebido === f.valorPago - f.tarifa) {
        return novoItem('A', Object.assign(base, { status: 'atencao', classificacao: 'tarifa', titulo: 'IXC baixou o valor líquido da tarifa',
          motivo: `${quem}; IXC recebeu ${R$(r.valorRecebido)} = pago ${R$(f.valorPago)} − tarifa ${R$(f.tarifa)} informada na francesinha.`,
          acao: 'Confirmar se a tarifa deve ser lançada à parte no IXC (baixa pelo valor bruto).' }));
      }
      const explicacao = r.valorRecebido === f.valorTitulo && f.valorTitulo !== f.valorPago
        ? ` O IXC baixou o valor original do título (${R$(f.valorTitulo)}); a diferença vem de juros/multa/desconto${f.mora ? ' (mora ' + R$(f.mora) + ')' : ''}${f.desconto ? ' (desconto ' + R$(f.desconto) + ')' : ''}.`
        : '';
      return novoItem('A', Object.assign(base, { status: 'divergente', classificacao: 'valor', precisaIa: !explicacao, titulo: 'Valor baixado no IXC diferente do pago no banco',
        motivo: `${quem}; pago no banco ${R$(f.valorPago)}, baixado no IXC ${R$(r.valorRecebido)} (diferença IXC − banco ${R$(dv)}).${explicacao}`,
        acao: explicacao ? 'Ajustar o valor da baixa no IXC para o valor efetivamente pago.' : 'Verificar o motivo da diferença de valor na baixa.' }));
    }

    if (tem.F && tem.R) {
      etapas.push('A');
      const idx = (arr, campo) => { const m = new Map(); arr.forEach((x) => { if (x[campo]) { const l = m.get(x[campo]); if (l) l.push(x); else m.set(x[campo], [x]); } }); return m; };
      const fPorNn = idx(F, 'nossoNumero'), rPorNn = idx(R, 'nossoNumero');

      // A1: nosso número exato
      fPorNn.forEach((fs, nn) => {
        const rs = rPorNn.get(nn) || [];
        if (!rs.length) return;
        if (fs.length === 1 && rs.length === 1) {
          const it = compararPar(fs[0], rs[0], 'A1', 'Mesmo nosso número');
          pareadoF.set(fs[0].ref, it); pareadoR.set(rs[0].ref, it);
          return;
        }
        // Repetição: o mesmo nosso número mais de uma vez em algum dos lados
        const it = novoItem('A', {
          classificacao: 'duplicado', status: 'divergente', precisaIa: true, regra: 'A1-dup', chave: nn,
          titulo: rs.length > fs.length ? 'Baixa duplicada no IXC' : fs.length > rs.length ? 'Título pago mais de uma vez no banco' : 'Nosso número repetido nos dois arquivos',
          refs: { francesinha: fs.map((x) => x.ref), ofx: [], ixc: rs.map((x) => x.ref) },
          valores: { francesinha: soma(fs, 'valorPago'), ixc: soma(rs, 'valorRecebido'), diferenca: soma(rs, 'valorRecebido') - soma(fs, 'valorPago') },
          datas: { pagamento: fs.map((x) => x.dataPagamento).join(', '), ixc: rs.map((x) => x.dataPagamento).join(', ') },
          motivo: `Nosso número ${nn} aparece ${fs.length}x na francesinha (${fs.map((x) => x.ref + ' ' + R$(x.valorPago)).join('; ')}) e ${rs.length}x no IXC (${rs.map((x) => x.ref + ' ' + R$(x.valorRecebido) + ' em ' + br(x.dataPagamento)).join('; ')}).`,
          acao: rs.length > fs.length ? 'Estornar a baixa excedente no IXC (confira qual veio do retorno/webhook e qual foi manual).' : 'Verificar com o cliente/banco o pagamento em duplicidade.'
        });
        fs.forEach((x) => pareadoF.set(x.ref, it)); rs.forEach((x) => pareadoR.set(x.ref, it));
      });

      // A2: sem o dígito verificador colado (só com valor igual e chave única dos dois lados)
      const fLivre = F.filter((f) => !pareadoF.has(f.ref));
      const rLivre = R.filter((r) => !pareadoR.has(r.ref) && r.nossoNumero);
      const unicos = (arr, chave) => { const m = new Map(); arr.forEach((x) => { const k = chave(x); if (k) m.set(k, m.has(k) ? null : x); }); return m; };
      const tentar = (chaveF, chaveR, regra, como) => {
        const mf = unicos(fLivre.filter((f) => !pareadoF.has(f.ref)), chaveF);
        const mr = unicos(rLivre.filter((r) => !pareadoR.has(r.ref)), chaveR);
        let n = 0;
        mf.forEach((f, k) => {
          const r = mr.get(k);
          if (!f || !r || r.valorRecebido !== f.valorPago) return;
          const it = compararPar(f, r, regra, como);
          pareadoF.set(f.ref, it); pareadoR.set(r.ref, it); n++;
        });
        return n;
      };
      const semDv = tentar((f) => f.nossoNumero, (r) => r.nossoNumeroSemUltimo, 'A2', 'Mesmo nosso número desconsiderando o último dígito (DV) do IXC')
        + tentar((f) => f.nossoNumeroSemUltimo, (r) => r.nossoNumero, 'A2', 'Mesmo nosso número desconsiderando o último dígito (DV) da francesinha');
      if (semDv) avisos.push({ tipo: 'nn_sem_dv', texto: `${semDv} par(es) só bateram ignorando o dígito verificador do nosso número (com valor igual). Confira o formato do nosso número no relatório do IXC.` });

      // A3: seu número da francesinha = ID do boleto no IXC (recebimentos sem nosso número)
      const fRest = F.filter((f) => !pareadoF.has(f.ref) && f.seuNumero);
      const mf = unicos(fRest, (f) => f.seuNumero.replace(/\D/g, '').replace(/^0+/, ''));
      const mr = unicos(R.filter((r) => !pareadoR.has(r.ref) && r.idBoleto), (r) => r.idBoleto.replace(/\D/g, '').replace(/^0+/, ''));
      mf.forEach((f, k) => {
        const r = k && mr.get(k);
        if (!f || !r) return;
        const it = compararPar(f, r, 'A3', 'Seu número da francesinha igual ao ID do boleto no IXC');
        pareadoF.set(f.ref, it); pareadoR.set(r.ref, it);
      });
    }

    /* =================== ETAPA B — francesinha × OFX (data de crédito) =================== */
    const usadoE = new Set();
    const itemDoTitulo = new Map();   // ref F -> item B
    const creditoCandidato = (e) => e.valor > 0 && (e.categoria === 'recebimento' || e.categoria === 'nao_classificado');

    if (tem.F && tem.E) {
      etapas.push('B');
      const ePorData = new Map();
      E.forEach((e) => { const l = ePorData.get(e.data); if (l) l.push(e); else ePorData.set(e.data, [e]); });
      const livresNoDia = (data) => (ePorData.get(data) || []).filter((e) => !usadoE.has(e.ref) && creditoCandidato(e));
      const grupos = new Map();
      F.filter((f) => f.dataCredito).forEach((f) => { const l = grupos.get(f.dataCredito); if (l) l.push(f); else grupos.set(f.dataCredito, [f]); });
      const datas = Array.from(grupos.keys()).sort();
      const periodoOfx = entrada.periodoOfx || (() => { const ds = E.map((e) => e.data).sort(); return ds.length ? { inicio: ds[0], fim: ds[ds.length - 1] } : null; })();
      const tol = Math.max(0, regraCredito.toleranciaDias | 0);

      // Subconjunto de créditos do dia que soma o alvo (até 8 créditos -> 255 combinações)
      function subconjunto(creds, alvo) {
        const c = creds.slice(0, 8);
        for (let m = 1; m < (1 << c.length); m++) {
          let s = 0; const sel = [];
          for (let k = 0; k < c.length; k++) if (m & (1 << k)) { s += c[k].valor; sel.push(c[k]); }
          if (s === alvo) return sel;
        }
        return null;
      }

      function registrarGrupo(fs, es, dados) {
        const it = novoItem('B', Object.assign({
          refs: { francesinha: fs.map((f) => f.ref), ofx: es.map((e) => e.ref), ixc: [] },
          valores: { francesinha: soma(fs, 'valorPago'), ofx: soma(es, 'valor'), diferenca: soma(es, 'valor') - soma(fs, 'valorPago') },
          datas: { credito: fs[0].dataCredito, ofx: Array.from(new Set(es.map((e) => e.data))).join(', ') }
        }, dados));
        fs.forEach((f) => itemDoTitulo.set(f.ref, it));
        es.forEach((e) => usadoE.add(e.ref));
        return it;
      }

      const alvosDoGrupo = (fs) => {
        const bruto = soma(fs, 'valorPago');
        const tarifaConhecida = fs.every((f) => f.tarifa != null) ? soma(fs, 'tarifa') : null;
        const alvos = [];
        if (regraCredito.tarifa !== 'descontada') alvos.push({ valor: bruto, tipo: 'bruto' });
        if (tarifaConhecida && regraCredito.tarifa !== 'separada') alvos.push({ valor: bruto - tarifaConhecida, tipo: 'liquido', tarifa: tarifaConhecida });
        if (!alvos.length) alvos.push({ valor: bruto, tipo: 'bruto' });
        return { bruto, tarifaConhecida, alvos };
      };

      datas.forEach((dc) => {
        const fs = grupos.get(dc);
        const { bruto, tarifaConhecida, alvos } = alvosDoGrupo(fs);
        const descTitulos = `${fs.length} título(s) com crédito previsto em ${br(dc)} somando ${R$(bruto)}${tarifaConhecida ? ' (tarifa informada ' + R$(tarifaConhecida) + ')' : ''}`;

        // B1: crédito em lote (um ou mais créditos do dia somando o total), D0..D+N
        if (regraCredito.modo !== 'individual') {
          for (let d = 0; d <= tol; d++) {
            const dia = norm.somarDias(dc, d);
            for (const alvo of alvos) {
              const sel = subconjunto(livresNoDia(dia), alvo.valor);
              if (!sel) continue;
              const liquido = alvo.tipo === 'liquido';
              const it = registrarGrupo(fs, sel, {
                status: d === 0 && !liquido ? 'ok' : 'atencao',
                classificacao: d > 0 ? 'data' : liquido ? 'tarifa' : (fs.length > 1 || sel.length > 1 ? 'lote' : 'conciliado'),
                regra: 'B1', titulo: d > 0 ? `Crédito do lote em D+${d}` : liquido ? 'Crédito do lote líquido de tarifa' : 'Crédito em lote confere com a francesinha',
                motivo: `${descTitulos}; ${sel.length === 1 ? 'crédito ' + sel[0].ref : sel.length + ' créditos (' + sel.map((e) => e.ref).join(', ') + ')'} de ${R$(alvo.valor)} em ${br(dia)} no OFX${liquido ? ' = total − tarifa' : ''}${d > 0 ? `, ${d} dia(s) depois da data de crédito prevista` : ''}.`,
                acao: d > 0 ? 'Na conciliação do IXC, a baixa e o crédito ficam em dias diferentes: concilie pela data do extrato.' : liquido ? 'Lançar a tarifa no IXC para fechar o lote (crédito veio líquido).' : (sel.length === 1 && fs.length > 1 ? 'Conciliar o lote no IXC (selecionar as baixas do dia contra o crédito único).' : undefined)
              });
              it.loteFrancesinha = true;
              return;
            }
          }
        }
        // B2: crédito título a título (bancos que creditam individualmente)
        if (regraCredito.modo !== 'lote') {
          const restantes = fs.slice();
          const casados = [];
          for (let d = 0; d <= tol && restantes.length; d++) {
            const livres = livresNoDia(norm.somarDias(dc, d));
            const porValor = new Map();
            livres.forEach((e) => { const l = porValor.get(e.valor); if (l) l.push(e); else porValor.set(e.valor, [e]); });
            for (let k = 0; k < restantes.length; k++) {
              const f = restantes[k];
              const valores = [f.valorPago].concat(f.tarifa != null ? [f.valorPago - f.tarifa] : []);
              for (const v of valores) {
                const l = porValor.get(v);
                if (l && l.length) { const e = l.shift(); casados.push({ f, e, d, liquido: v !== f.valorPago }); restantes.splice(k--, 1); break; }
              }
            }
          }
          if (casados.length && (regraCredito.modo === 'individual' || !restantes.length)) {
            casados.forEach(({ f, e, d, liquido }) => registrarGrupo([f], [e], {
              status: d === 0 && !liquido ? 'ok' : 'atencao', classificacao: d > 0 ? 'data' : liquido ? 'tarifa' : 'conciliado', regra: 'B2',
              titulo: d > 0 ? `Crédito individual em D+${d}` : liquido ? 'Crédito individual líquido de tarifa' : 'Crédito individual confere',
              motivo: `Título ${f.ref} (nosso número ${f.nossoNumeroBruto}, pago ${R$(f.valorPago)}, crédito previsto ${br(dc)}) ↔ crédito ${e.ref} de ${R$(e.valor)} em ${br(e.data)}${liquido ? ' (valor − tarifa)' : ''}. Créditos de mesmo valor no mesmo dia são equivalentes entre si.`
            }));
            if (!restantes.length) return;
            fs.splice(0, fs.length, ...restantes);
          }
        }
        // B3: nada bateu. Só aponta par quando há UM crédito de cobrança no dia (evidência); senão, sem correspondência.
        const fsRest = fs.filter((f) => !itemDoTitulo.has(f.ref));
        const totalRest = soma(fsRest, 'valorPago');
        const forado = periodoOfx && (dc < periodoOfx.inicio || dc > periodoOfx.fim);
        if (forado) {
          registrarGrupo(fsRest, [], { status: 'divergente', classificacao: 'sem_correspondencia', regra: 'B-fora', titulo: 'Crédito previsto fora do período do extrato',
            motivo: `${fsRest.length} título(s) com crédito previsto em ${br(dc)} (${R$(totalRest)}), fora do período do OFX (${br(periodoOfx.inicio)} a ${br(periodoOfx.fim)}).`,
            acao: 'Pedir o extrato que cobre essa data, se o crédito fizer parte da conciliação.' });
          return;
        }
        const doDia = livresNoDia(dc).filter((e) => e.categoria === 'recebimento' && e.subtipo !== 'pix');
        if (doDia.length === 1) {
          const e = doDia[0], dif = e.valor - totalRest;
          const tarifaHint = dif < 0 && tarifaConhecida == null ? ` A francesinha deste banco não informa tarifa: se a tarifa de cobrança for ${R$(-dif)}, o crédito veio líquido.` : '';
          registrarGrupo(fsRest, [e], { status: 'divergente', classificacao: 'valor', precisaIa: true, regra: 'B3', titulo: 'Crédito do dia com valor diferente da francesinha',
            motivo: `${fsRest.length} título(s) com crédito previsto em ${br(dc)} somam ${R$(totalRest)}; o único crédito de cobrança do dia no OFX (${e.ref}, "${e.descricao}") é de ${R$(e.valor)} (diferença banco − francesinha ${R$(dif)}).${tarifaHint}`,
            acao: 'Conferir tarifas, títulos de outro dia no mesmo crédito ou estornos do banco.' });
          return;
        }
        registrarGrupo(fsRest, [], { status: 'divergente', classificacao: 'sem_correspondencia', precisaIa: true, regra: 'B-sem',
          titulo: 'Crédito da francesinha não encontrado no extrato',
          motivo: `${fsRest.length} título(s) com crédito previsto em ${br(dc)} somam ${R$(totalRest)}; nenhum crédito (ou combinação de créditos) de cobrança no OFX entre ${br(dc)} e ${br(norm.somarDias(dc, tol))} tem esse valor${doDia.length > 1 ? ` (${doDia.length} créditos de cobrança no dia: ${doDia.map((e) => e.ref + ' ' + R$(e.valor)).join(', ')})` : ''}.`,
          acao: 'Conferir se o crédito veio agrupado com outro dia ou se há retenção/estorno do banco.' });
      });

      // Tarifas debitadas à parte no extrato
      const tarifas = E.filter((e) => e.categoria === 'tarifa' && !usadoE.has(e.ref));
      const tarifaPorDia = new Map();
      F.forEach((f) => { if (f.tarifa != null && f.dataCredito) tarifaPorDia.set(f.dataCredito, (tarifaPorDia.get(f.dataCredito) || 0) + f.tarifa); });
      tarifas.forEach((e) => {
        let ligado = null;
        for (let d = 0; d <= tol && !ligado; d++) { const dia = norm.somarDias(e.data, -d); if (tarifaPorDia.get(dia) === -e.valor) ligado = dia; }
        const titulosDoDia = (grupos.get(e.data) || []).length;
        usadoE.add(e.ref);
        novoItem('B', { status: 'atencao', classificacao: 'tarifa', regra: 'B-tarifa', titulo: ligado ? 'Tarifa da cobrança debitada à parte' : 'Tarifa no extrato',
          refs: { francesinha: [], ofx: [e.ref], ixc: [] }, valores: { ofx: e.valor }, datas: { ofx: e.data },
          motivo: ligado ? `Débito ${e.ref} de ${R$(-e.valor)} em ${br(e.data)} = soma das tarifas informadas na francesinha para o crédito de ${br(ligado)}.`
            : `Débito ${e.ref} "${e.descricao}" de ${R$(-e.valor)} em ${br(e.data)} classificado como tarifa${titulosDoDia ? ` (há ${titulosDoDia} título(s) creditado(s) neste dia)` : ''}.`,
          acao: 'Conferir se a tarifa está lançada como despesa no IXC na mesma data.' });
      });
    }

    /* =================== ETAPA C — OFX × IXC (o que sobrou) =================== */
    if (tem.E && tem.R) {
      etapas.push('C');
      const poolR = R.filter((r) => !pareadoR.has(r.ref));
      // Repetições do mesmo FITID ficam de fora (são apontadas como duplicadas na etapa D)
      const fitidVisto = new Set();
      const poolE = E.filter((e) => {
        if (usadoE.has(e.ref) || !(e.valor > 0 || e.categoria === 'estorno')) return false;
        if (e.fitid) { if (fitidVisto.has(e.fitid)) return false; fitidVisto.add(e.fitid); }
        return true;
      });
      const mov = poolR.map((r) => ({ id: r.ref, conciliado: false, data: r.dataCredito || r.dataPagamento, valor: r.valorRecebido, documento: r.idBoleto || '', tx_id: '', historico: '' }));
      const ext = poolE.map((e) => ({ id: e.ref, conciliado: false, data: e.data, valor: e.valor, documento: e.documento || '', tx_id: e.fitid || '', historico: e.descricao }));
      const res = L.domain.pareamento.parear(mov, ext);
      const porRefR = new Map(poolR.map((r) => [r.ref, r])), porRefE = new Map(poolE.map((e) => [e.ref, e]));
      res.pares.forEach((p) => {
        const rs = p.ixc.map((id) => porRefR.get(id)), es = p.extrato.map((id) => porRefE.get(id));
        const e = es[0];
        const base = { refs: { francesinha: [], ofx: [e.ref], ixc: rs.map((r) => r.ref) },
          valores: { ofx: e.valor, ixc: soma(rs, 'valorRecebido'), diferenca: soma(rs, 'valorRecebido') - e.valor },
          datas: { ofx: e.data, ixc: rs.map((r) => r.dataCredito || r.dataPagamento).join(', ') } };
        const descR = rs.map((r) => `${r.ref}${r.idBoleto ? ' (boleto ' + r.idBoleto + ')' : ''} ${R$(r.valorRecebido)} em ${br(r.dataCredito || r.dataPagamento)}`).join('; ');
        let it;
        if (p.ambiguo) {
          // todos os créditos candidatos (mesmo valor, D0/D+1, ainda livres) entram no item: nenhum é escolhido
          const r0 = rs[0], d0 = r0.dataCredito || r0.dataPagamento;
          const candidatos = poolE.filter((x) => !usadoE.has(x.ref) && x.valor === e.valor && norm.difDias(d0, x.data) >= 0 && norm.difDias(d0, x.data) <= 1);
          base.refs.ofx = candidatos.map((x) => x.ref);
          base.valores.ofx = e.valor;
          candidatos.forEach((x) => usadoE.add(x.ref));
          it = novoItem('C', Object.assign(base, { status: 'divergente', classificacao: 'sem_correspondencia', precisaIa: true, regra: 'C-ambiguo', titulo: 'Par ambíguo (mais de um crédito possível)',
            motivo: `${descR} tem ${candidatos.length} créditos de mesmo valor no OFX em D0/D+1 (${candidatos.map((x) => `${x.ref} em ${br(x.data)} "${x.descricao}"`).join('; ')}); não há evidência para escolher um deles. Não foi conciliado automaticamente.`,
            acao: 'Escolher o crédito certo pelo ID/descrição antes de conciliar.' }));
          rs.forEach((r) => pareadoR.set(r.ref, it));
          return;
        }
        const d1 = rs.some((r) => (r.dataCredito || r.dataPagamento) !== e.data);
        if (p.tipo === 'lote') {
          it = novoItem('C', Object.assign(base, { status: d1 ? 'atencao' : 'ok', classificacao: d1 ? 'data' : 'lote', regra: 'C-lote', titulo: d1 ? 'Lote creditado no dia seguinte (D+1)' : 'Crédito em lote = soma de recebimentos',
            motivo: `Crédito ${e.ref} de ${R$(e.valor)} em ${br(e.data)} ("${e.descricao}") = soma de ${rs.length} recebimentos do IXC: ${descR}.`,
            acao: 'Conciliar o lote no IXC selecionando todos os recebimentos contra o crédito.' }));
        } else {
          const porId = p.tipo === 'identificador';
          it = novoItem('C', Object.assign(base, { status: d1 ? 'atencao' : 'ok', classificacao: d1 ? 'data' : 'conciliado', regra: porId ? 'C-id' : 'C-valor-data',
            titulo: d1 ? 'Crédito no dia seguinte ao pagamento (D+1)' : porId ? 'Mesmo identificador e valor' : 'Mesmo valor e data',
            motivo: `${descR} ↔ crédito ${e.ref} de ${R$(e.valor)} em ${br(e.data)} ("${e.descricao}")${porId ? ', com o mesmo documento/identificador' : ', único crédito com esse valor em D0/D+1'}.` }));
        }
        rs.forEach((r) => pareadoR.set(r.ref, it)); usadoE.add(e.ref);
      });
    }

    /* =================== ETAPA D — classificação final =================== */
    etapas.push('D');
    // D1: mesmo ID de boleto com mais de uma baixa no IXC (fora o que a etapa A já apontou)
    const jaDuplicado = new Set(itens.filter((i) => i.classificacao === 'duplicado').flatMap((i) => i.refs.ixc));
    const porBoleto = new Map();
    R.forEach((r) => { if (r.idBoleto && !jaDuplicado.has(r.ref)) { const l = porBoleto.get(r.idBoleto); if (l) l.push(r); else porBoleto.set(r.idBoleto, [r]); } });
    porBoleto.forEach((rs, idB) => {
      if (rs.length < 2) return;
      novoItem('D', { classificacao: 'duplicado', status: 'divergente', precisaIa: true, regra: 'D-boleto', chave: idB, titulo: 'Boleto com mais de uma baixa no IXC',
        refs: { francesinha: [], ofx: [], ixc: rs.map((r) => r.ref) }, valores: { ixc: soma(rs, 'valorRecebido') }, datas: { ixc: rs.map((r) => r.dataPagamento).join(', ') },
        motivo: `ID do boleto ${idB} aparece em ${rs.length} recebimentos: ${rs.map((r) => `${r.ref} ${R$(r.valorRecebido)} em ${br(r.dataPagamento)}${r.forma ? ' (' + r.forma + ')' : ''}`).join('; ')}.`,
        acao: 'Conferir se é parcelamento/pagamento parcial; se não for, estornar a baixa excedente.' });
    });
    // D2: lançamentos repetidos no OFX (mesmo FITID, ou mesma data+valor+descrição+documento)
    const jaVistos = new Map();
    E.forEach((e) => {
      const k = e.fitid ? 'F:' + e.fitid : 'L:' + [e.data, e.valor, e.documento, e.descricao].join('|');
      const l = jaVistos.get(k); if (l) l.push(e); else jaVistos.set(k, [e]);
    });
    jaVistos.forEach((es) => {
      if (es.length < 2) return;
      novoItem('D', { classificacao: 'duplicado', status: 'divergente', precisaIa: true, regra: 'D-ofx', titulo: 'Lançamento repetido no OFX',
        refs: { francesinha: [], ofx: es.map((e) => e.ref), ixc: [] }, valores: { ofx: soma(es, 'valor') }, datas: { ofx: es[0].data },
        motivo: `${es.length} lançamentos iguais no extrato (${es[0].fitid ? 'FITID ' + es[0].fitid : 'mesma data, valor e descrição'}): ${es.map((e) => e.ref).join(', ')} — ${R$(es[0].valor)} em ${br(es[0].data)}.`,
        acao: 'Conferir se o OFX foi importado duas vezes no IXC ou se o banco repetiu o lançamento.' });
    });

    // D3: francesinha sem par no IXC
    if (tem.F && tem.R) {
      F.filter((f) => !pareadoF.has(f.ref)).forEach((f) => {
        const credito = itemDoTitulo.get(f.ref);
        novoItem('D', { classificacao: 'so_banco', status: 'divergente', precisaIa: true, regra: 'D-so-banco-F', chave: f.nossoNumero, titulo: 'Boleto pago no banco sem baixa no IXC',
          refs: { francesinha: [f.ref], ofx: credito ? credito.refs.ofx.slice() : [], ixc: [] }, valores: { francesinha: f.valorPago }, datas: { pagamento: f.dataPagamento, credito: f.dataCredito },
          motivo: `Nosso número ${f.nossoNumeroBruto} pago ${R$(f.valorPago)} em ${br(f.dataPagamento) || '—'} (crédito ${br(f.dataCredito) || '—'}) não aparece no relatório de recebimentos do IXC${f.seuNumero ? ` (seu número ${f.seuNumero} também não bate com nenhum ID de boleto)` : ''}${credito && credito.status !== 'divergente' ? '; o valor entrou no extrato junto do crédito ' + credito.refs.ofx.join(', ') : ''}.`,
          acao: 'Verificar se o retorno/webhook desse título foi processado; se não, dar a baixa no IXC.' });
      });
    }
    // D4: recebimentos IXC sem par
    if (tem.R) {
      R.filter((r) => !pareadoR.has(r.ref) && !jaDuplicado.has(r.ref) && !itens.some((i) => i.regra === 'D-boleto' && i.refs.ixc.includes(r.ref))).forEach((r) => {
        const manual = RE_MANUAL.test(norm.chaveTexto(r.forma)) || (!r.nossoNumero && tem.F);
        const foraFrancesinha = tem.F && r.nossoNumero && naFrancesinhaPeriodo && (r.dataPagamento < naFrancesinhaPeriodo.ini || r.dataPagamento > naFrancesinhaPeriodo.fim);
        if (foraFrancesinha && !tem.E) {
          novoItem('D', { classificacao: 'sem_correspondencia', status: 'divergente', regra: 'D-fora-F', titulo: 'Recebimento fora do período da francesinha',
            refs: { francesinha: [], ofx: [], ixc: [r.ref] }, valores: { ixc: r.valorRecebido }, datas: { ixc: r.dataPagamento },
            motivo: `${r.ref} (${R$(r.valorRecebido)} em ${br(r.dataPagamento)}) está fora do período coberto pela francesinha (${br(naFrancesinhaPeriodo.ini)} a ${br(naFrancesinhaPeriodo.fim)}).` });
          return;
        }
        novoItem('D', { classificacao: 'so_ixc', status: 'divergente', precisaIa: true, regra: 'D-so-ixc', chave: r.nossoNumero || r.idBoleto,
          titulo: manual ? 'Possível baixa manual sem crédito no banco' : 'Baixa no IXC sem pagamento identificado',
          refs: { francesinha: [], ofx: [], ixc: [r.ref] }, valores: { ixc: r.valorRecebido }, datas: { ixc: r.dataPagamento },
          motivo: `${r.ref}${r.idBoleto ? ' (boleto ' + r.idBoleto + ')' : ''}${r.nossoNumero ? ' nosso número ' + r.nossoNumeroBruto : ' sem nosso número'}, ${R$(r.valorRecebido)} em ${br(r.dataPagamento)}${r.forma ? ', forma "' + r.forma + '"' : ''}: ${[tem.F && r.nossoNumero ? 'não está na francesinha' : '', tem.E ? 'nenhum crédito do OFX corresponde (identificador, valor + D0/D+1 ou lote)' : ''].filter(Boolean).join(' e ') || 'sem arquivo do banco para comparar'}${foraFrancesinha ? ' (data fora do período da francesinha)' : ''}.`,
          acao: manual ? 'Confirmar com o cliente se o valor foi recebido em dinheiro/outra conta; se não, estornar a baixa.' : 'Verificar se a baixa foi feita na conta certa ou se é recebimento indevido.' });
      });
    }
    // D5: créditos e débitos do OFX que sobraram
    if (tem.E) {
      const noItemDeRepetidos = new Set(itens.filter((i) => i.regra === 'D-ofx').flatMap((i) => i.refs.ofx.slice(1)));
      E.filter((e) => !usadoE.has(e.ref) && !noItemDeRepetidos.has(e.ref)).forEach((e) => {   // a 1ª ocorrência segue o fluxo normal
        const rot = A.classificacaoOfx.CATEGORIAS[e.categoria] || e.categoria;
        if (e.valor < 0) {
          const tarifa = e.categoria === 'tarifa';
          novoItem('D', { classificacao: tarifa ? 'tarifa' : 'sem_correspondencia', status: tarifa ? 'atencao' : 'fora_escopo', regra: tarifa ? 'D-tarifa' : 'D-saida',
            titulo: tarifa ? 'Tarifa no extrato' : `Saída do extrato (${rot.toLowerCase()})`,
            refs: { francesinha: [], ofx: [e.ref], ixc: [] }, valores: { ofx: e.valor }, datas: { ofx: e.data },
            motivo: `${e.ref} "${e.descricao}" de ${R$(e.valor)} em ${br(e.data)} (classificado como ${rot} pela regra ${e.regra}). ${tarifa ? 'Tarifas não fazem parte dos recebimentos.' : 'Débitos ficam fora do cruzamento de recebimentos.'}`,
            acao: 'Conferir se a saída está lançada no IXC (procedimento: saídas primeiro).' });
          return;
        }
        const diversa = ['rendimento', 'transferencia'].includes(e.categoria);
        const estorno = e.categoria === 'estorno' || e.categoria === 'retencao';
        novoItem('D', { classificacao: estorno ? 'sem_correspondencia' : 'so_banco', status: 'divergente', precisaIa: true, regra: 'D-so-banco-E',
          titulo: diversa ? `Entrada diversa sem lançamento (${rot.toLowerCase()})` : estorno ? `${rot} no extrato` : 'Crédito no banco sem baixa no IXC',
          refs: { francesinha: [], ofx: [e.ref], ixc: [] }, valores: { ofx: e.valor }, datas: { ofx: e.data },
          motivo: `${e.ref} "${e.descricao}" de ${R$(e.valor)} em ${br(e.data)} (${rot}, regra ${e.regra}) não corresponde a nenhum ${tem.F ? 'lote/título da francesinha nem ' : ''}${tem.R ? 'recebimento do IXC' : 'registro'}.`,
          acao: diversa ? 'Lançar como entrada diversa no IXC, se for o caso (não é recebimento de boleto).' : 'Identificar o pagador (PIX/boleto não baixado) e dar a baixa no IXC.' });
      });
    }
    // Ligação A -> OFX: cada par francesinha/IXC mostra o crédito em que o título entrou
    itens.filter((i) => i.etapa === 'A').forEach((i) => {
      const cred = new Set();
      i.refs.francesinha.forEach((rf) => { const b = itemDoTitulo.get(rf); if (b) b.refs.ofx.forEach((x) => cred.add(x)); });
      i.contexto.ofx = Array.from(cred);
      i.contexto.itemB = Array.from(new Set(i.refs.francesinha.map((rf) => itemDoTitulo.get(rf)).filter(Boolean).map((b) => b.id)));
    });
    // Recalcula o grupo (itens podem ter tido status ajustado)
    itens.forEach((i) => { i.grupo = grupoDo(i); });

    /* ---------- Cobertura: toda linha lida precisa estar em algum item ---------- */
    const cobertas = new Set();
    itens.forEach((i) => { i.refs.francesinha.forEach((x) => cobertas.add(x)); i.refs.ofx.forEach((x) => cobertas.add(x)); i.refs.ixc.forEach((x) => cobertas.add(x)); });
    const todas = F.map((x) => x.ref).concat(E.map((x) => x.ref), R.map((x) => x.ref));
    const naoCobertas = todas.filter((x) => !cobertas.has(x));
    // Títulos sem data de crédito (fora da etapa B) estão cobertos pela etapa A; sem IXC, viram item próprio
    naoCobertas.filter((x) => x.startsWith('F:')).forEach((ref) => {
      const f = F.find((y) => y.ref === ref);
      novoItem('D', { classificacao: 'sem_correspondencia', status: 'divergente', precisaIa: false, regra: 'D-sem-dados', titulo: 'Título sem data de crédito',
        refs: { francesinha: [ref], ofx: [], ixc: [] }, valores: { francesinha: f.valorPago }, datas: { pagamento: f.dataPagamento },
        motivo: `${ref} (nosso número ${f.nossoNumeroBruto}) não tem data de crédito na francesinha e não há relatório do IXC para comparar.` });
      cobertas.add(ref);
    });
    const faltando = todas.filter((x) => !cobertas.has(x));
    itens.forEach((i) => { i.grupo = grupoDo(i); });

    const resumo = resumir({ itens, F, E, R, banco, etapas, entrada, avisos });
    return {
      versao: 1,
      etapas,
      parcial: !(tem.F && tem.E && tem.R),
      banco: banco ? { id: banco.id, nome: banco.nome, credito: regraCredito } : null,
      itens,
      registros: { francesinha: F, ofx: E, ixc: R },
      resumo,
      avisos,
      cobertura: { ok: faltando.length === 0, faltando }
    };
  }

  function resumir({ itens, F, E, R, banco, etapas }) {
    const datas = [].concat(E.map((e) => e.data), F.map((f) => f.dataCredito || f.dataPagamento), R.map((r) => r.dataPagamento)).filter(Boolean).sort();
    const porGrupo = {};
    GRUPOS.forEach((g2) => { porGrupo[g2.id] = 0; });
    itens.forEach((i) => { porGrupo[i.grupo] = (porGrupo[i.grupo] || 0) + 1; });
    const refsEm = (filtro) => { const s = new Set(); itens.filter(filtro).forEach((i) => [].concat(i.refs.francesinha, i.refs.ofx, i.refs.ixc).forEach((x) => s.add(x))); return s.size; };
    return {
      banco: banco ? banco.nome : '—',
      periodo: datas.length ? { inicio: datas[0], fim: datas[datas.length - 1] } : null,
      qtd: { francesinha: F.length, ofx: E.length, ixc: R.length },
      totais: {
        francesinhaPago: F.reduce((a, f) => a + f.valorPago, 0),
        ofxCreditos: E.filter((e) => e.valor > 0).reduce((a, e) => a + e.valor, 0),
        ofxDebitos: E.filter((e) => e.valor < 0).reduce((a, e) => a + e.valor, 0),
        ixcRecebido: R.reduce((a, r) => a + r.valorRecebido, 0)
      },
      correspondencias: itens.filter((i) => i.status === 'ok').length,
      atencao: itens.filter((i) => i.status === 'atencao').length,
      divergencias: itens.filter((i) => i.status === 'divergente').length,
      semCorrespondencia: itens.filter((i) => ['so_banco', 'so_ixc', 'sem_correspondencia'].includes(i.classificacao) && i.status !== 'fora_escopo').length,
      foraEscopo: itens.filter((i) => i.status === 'fora_escopo').length,
      linhasConciliadas: refsEm((i) => i.status === 'ok'),
      precisamIa: itens.filter((i) => i.precisaIa).length,
      porGrupo,
      etapas
    };
  }

  A.motor = { executar, CLASSIFICACOES, GRUPOS };
})(typeof self !== 'undefined' ? self : globalThis);

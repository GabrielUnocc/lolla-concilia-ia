/*
 * Modo Análise — etapas 1 a 3: envio dos arquivos, identificação do banco e conferência dos dados extraídos.
 * Aqui só fica a orquestração e a tela; leitura e normalização estão em domain/analise/.
 */
(function (g) {
  const L = g.Lolla;
  const UI = L.ui.analise;
  const A = L.domain.analise;
  const c = UI.c;
  const { esc } = c;

  const TIPOS = {
    francesinha: { titulo: 'Francesinha', icone: '📄', aceita: '.pdf,application/pdf', formatos: 'PDF com texto (relatório de títulos liquidados)', limiteMb: 30 },
    ofx: { titulo: 'Extrato bancário', icone: '🏦', aceita: '.ofx,.OFX,application/x-ofx', formatos: 'OFX', limiteMb: 15 },
    ixc: { titulo: 'Recebimentos IXC', icone: '🧾', aceita: '.csv,.txt,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', formatos: 'CSV, XLS ou XLSX exportado do IXC', limiteMb: 20 }
  };

  const vazio = () => ({ arquivo: null, status: 'vazio', erro: '', leitura: null });

  /* =================== Leitura =================== */
  async function receber(tipo, arquivo) {
    const e = UI.estado;
    const def = TIPOS[tipo];
    e.analise = null; e.ia.resultados = {}; e.ia.preparo = null;
    const slot = e.arquivos[tipo] = Object.assign(vazio(), { arquivo: { nome: arquivo.name, tamanho: arquivo.size }, status: 'lendo', progresso: '' });
    UI.render();
    try {
      if (arquivo.size > def.limiteMb * 1048576) throw new Error(`Arquivo maior que ${def.limiteMb} MB. Exporte um período menor.`);
      if (!arquivo.size) throw new Error('Arquivo vazio.');
      if (tipo === 'francesinha') {
        slot.paginas = await L.services.pdfTexto.extrair(arquivo, (i, n) => { slot.progresso = `página ${i} de ${n}`; UI.renderParte('arquivos'); });
        slot.texto = A.leitorFrancesinha.textoCorrido(slot.paginas);   // lança erro se o PDF não tiver texto
      } else if (tipo === 'ofx') {
        const texto = await L.domain.ofx.lerArquivo(arquivo);
        slot.leitura = A.leitorOfx.ler(texto, arquivo.name);
      } else {
        slot.planilha = await A.planilha.ler(new Uint8Array(await arquivo.arrayBuffer()), arquivo.name);
        slot.aba = maiorAba(slot.planilha);
        slot.opcoes = {};
      }
      slot.status = 'ok';
    } catch (err) {
      slot.status = 'erro';
      slot.erro = err.message || String(err);
    }
    reprocessar();
  }

  const maiorAba = (pl) => pl.abas.reduce((m, a, k) => (a.linhas.length > pl.abas[m].linhas.length ? k : m), 0);

  // Refaz tudo o que depende dos arquivos: recebimentos (mapeamento), banco e francesinha (layout do banco)
  function reprocessar() {
    const e = UI.estado;
    const ixc = e.arquivos.ixc;
    if (ixc.planilha) {
      ixc.leitura = A.leitorRecebimentos.interpretar(ixc.planilha.abas[ixc.aba].linhas, ixc.opcoes, ixc.arquivo.nome);
      ixc.status = ixc.leitura.status === 'ok' ? (ixc.leitura.avisos.length ? 'aviso' : 'ok') : 'erro';
      ixc.erro = ixc.leitura.status === 'ok' ? '' : ixc.leitura.mensagem;
    }
    const ofx = e.arquivos.ofx;
    if (ofx.leitura) ofx.status = ofx.leitura.avisos.length ? 'aviso' : 'ok';
    e.banco.deteccao = A.bancos.detectar({
      ofx: ofx.leitura,
      textoFrancesinha: e.arquivos.francesinha.texto,
      contasIxc: ixc.leitura && ixc.leitura.contas
    });
    const idBanco = e.banco.manual || e.banco.deteccao.id;
    const banco = idBanco ? A.bancos.obter(idBanco) : null;
    if (!e.banco.credito || e.banco.creditoDe !== idBanco) { e.banco.credito = banco ? Object.assign({}, banco.credito) : null; e.banco.creditoDe = idBanco; }
    const fr = e.arquivos.francesinha;
    if (fr.paginas && fr.texto) {
      fr.leitura = null; fr.erro = '';
      if (!banco) { fr.status = 'erro'; fr.erro = 'Banco não identificado: escolha o banco na etapa 2 para ler a francesinha.'; }
      else {
        try {
          fr.leitura = A.leitorFrancesinha.interpretar(fr.paginas, banco.francesinha, fr.arquivo.nome);
          fr.status = fr.leitura.avisos.length ? 'aviso' : 'ok';
        } catch (err) {
          fr.status = 'erro';
          fr.erro = err.codigo === 'sem_layout' ? `A francesinha do ${banco.nome} ainda não tem leitor nesta versão (aguardando amostra). ${err.message}` : err.message;
        }
      }
    }
    UI.render();
  }

  function limpar(tipo) {
    const e = UI.estado;
    e.arquivos[tipo] = vazio();
    e.analise = null; e.ia.resultados = {}; e.ia.preparo = null;
    reprocessar();
  }

  const pronto = (tipo) => { const s = UI.estado.arquivos[tipo]; return (s.status === 'ok' || s.status === 'aviso') && !!s.leitura; };
  const podeAnalisar = () => ['francesinha', 'ofx', 'ixc'].every(pronto);

  function bancoAtual() {
    const e = UI.estado;
    const id = e.banco.manual || (e.banco.deteccao && e.banco.deteccao.id);
    const b = id ? A.bancos.obter(id) : null;
    return b ? Object.assign({}, b, { credito: Object.assign({}, b.credito, e.banco.credito) }) : null;
  }

  /* =================== Telas =================== */
  function qtdLida(tipo, s) {
    if (!s.leitura) return '';
    if (tipo === 'francesinha') return `${s.leitura.registros.length} título(s) em ${s.leitura.paginas} página(s)`;
    if (tipo === 'ofx') return `${s.leitura.registros.length} lançamento(s) · ${c.br(s.leitura.periodo.inicio)} a ${c.br(s.leitura.periodo.fim)}`;
    return s.leitura.status === 'ok' ? `${s.leitura.registros.length} recebimento(s) · ${s.planilha.formato.toUpperCase()}` : '';
  }

  function cartaoUpload(tipo) {
    const def = TIPOS[tipo], s = UI.estado.arquivos[tipo];
    const estado = {
      vazio: '<span class="nota">Aguardando arquivo</span>',
      lendo: c.spinner('Lendo' + (s.progresso ? ' ' + s.progresso : '') + '…'),
      ok: `<span class="selo verde">✓ Lido</span> ${esc(qtdLida(tipo, s))}`,
      aviso: `<span class="selo amarelo">✓ Lido com avisos</span> ${esc(qtdLida(tipo, s))}`,
      erro: `<span class="selo vermelho">Não foi possível usar</span>`
    }[s.status];
    return `<section class="drop ${s.status === 'vazio' || s.status === 'lendo' ? '' : s.status}" data-drop="${tipo}" aria-label="${esc(def.titulo)}">
      <h3><span aria-hidden="true">${def.icone}</span>${esc(def.titulo)}</h3>
      <div class="tipos">${esc(def.formatos)} · arraste aqui ou selecione</div>
      ${s.arquivo ? `<div class="arquivo"><b>${esc(s.arquivo.nome)}</b> · ${c.tamanho(s.arquivo.tamanho)}</div>` : ''}
      <div class="estado" aria-live="polite">${estado}</div>
      ${s.erro ? c.alerta('erro', esc(s.erro)) : ''}
      <div class="acoes">
        <label class="btn ${s.arquivo ? '' : 'primario'}">${s.arquivo ? 'Trocar arquivo' : 'Selecionar arquivo'}<input type="file" class="sr" data-arquivo="${tipo}" accept="${def.aceita}"></label>
        ${s.arquivo ? `<button class="btn" data-acao="limpar" data-tipo="${tipo}">Remover</button>` : ''}
      </div>
    </section>`;
  }

  function telaArquivos() {
    const nomes = { francesinha: 'francesinha', ofx: 'extrato OFX', ixc: 'relatório de recebimentos do IXC' };
    const faltam = Object.keys(nomes).filter((t) => !pronto(t));
    return `<header><h2><span class="passo ${faltam.length ? '' : 'ok'}">1</span>Arquivos</h2></header>
      <p class="lead">Os arquivos são lidos aqui no navegador e não são enviados para nenhum servidor.</p>
      <div class="uploads">${['francesinha', 'ofx', 'ixc'].map(cartaoUpload).join('')}</div>
      <div class="faltam ${faltam.length ? '' : 'ok'}" role="status">${faltam.length
        ? `Falta${faltam.length > 1 ? 'm' : ''}: ${esc(faltam.map((t) => nomes[t]).join(', '))}. O cruzamento completo precisa dos três arquivos.`
        : 'Os três arquivos foram lidos. Confira o banco e os dados extraídos e execute o cruzamento.'}</div>`;
  }

  function telaBanco() {
    const e = UI.estado, d = e.banco.deteccao;
    const algum = ['francesinha', 'ofx', 'ixc'].some((t) => e.arquivos[t].arquivo);
    const b = bancoAtual();
    const tom = { alta: 'verde', media: 'amarelo', baixa: 'vermelho', nenhuma: 'cinza' }[d ? d.confianca : 'nenhuma'];
    const cred = e.banco.credito || {};
    return `<header><h2><span class="passo ${b ? 'ok' : ''}">2</span>Banco</h2></header>
      ${!algum ? '<p class="lead">O banco é identificado automaticamente pelo código do OFX e pelo layout da francesinha.</p>' : `
      <div class="banco-linha">
        <div><div class="nota">Banco ${e.banco.manual ? 'escolhido manualmente' : 'identificado'}</div><div class="banco-nome">${b ? esc(b.nome) : 'Não identificado'}</div></div>
        ${d ? c.selo('Confiança ' + d.confianca, tom) : ''}
        ${b ? c.selo(b.status === 'completo' ? 'Leitor da francesinha disponível' : 'Leitor da francesinha pendente', b.status === 'completo' ? 'verde' : 'amarelo') : ''}
        <span class="sep" style="flex:1"></span>
        <label class="campo">Corrigir banco
          <select data-acao="banco">
            <option value="">Automático${d && d.id ? ' (' + esc(A.bancos.obter(d.id).nome) + ')' : ''}</option>
            ${A.bancos.lista().map((x) => `<option value="${x.id}" ${e.banco.manual === x.id ? 'selected' : ''}>${esc(x.nome)} (${x.codigos.join('/')})${x.status === 'completo' ? '' : ' — leitor pendente'}</option>`).join('')}
          </select></label>
      </div>
      ${d && d.conflito ? c.alerta('erro', 'O OFX e a francesinha parecem ser de bancos diferentes. Confira se os arquivos são da mesma conta.') : ''}
      ${d && d.evidencias.length ? `<ul class="evidencias">${d.evidencias.map((x) => `<li>${esc(x.detalhe)}</li>`).join('')}</ul>` : ''}
      ${b && b.status !== 'completo' ? c.alerta('aviso', `<b>${esc(b.nome)}</b>: estrutura pronta, mas ainda falta:` + c.lista(b.pendencias)) : ''}
      ${b ? `<details class="avancado"><summary>Regra de crédito da cobrança (${esc(b.nome)})</summary>
        <p class="nota">Como o banco credita os boletos no extrato. Ajuste só se souber que este cliente é diferente do padrão do banco.</p>
        <div class="grade-form">
          <label class="campo">Crédito
            <select data-acao="credito" data-campo="modo">
              ${[['auto', 'Automático (lote ou individual)'], ['lote', 'Lote diário'], ['individual', 'Um crédito por boleto']].map(([v, t]) => `<option value="${v}" ${cred.modo === v ? 'selected' : ''}>${t}</option>`).join('')}
            </select></label>
          <label class="campo">Tolerância de dias (D+N)
            <select data-acao="credito" data-campo="toleranciaDias">${[0, 1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${Number(cred.toleranciaDias) === n ? 'selected' : ''}>D+${n}</option>`).join('')}</select></label>
          <label class="campo">Tarifa
            <select data-acao="credito" data-campo="tarifa">
              ${[['desconhecida', 'Não sei (testa as duas)'], ['descontada', 'Descontada do crédito'], ['separada', 'Débito separado']].map(([v, t]) => `<option value="${v}" ${cred.tarifa === v ? 'selected' : ''}>${t}</option>`).join('')}
            </select></label>
        </div></details>` : ''}`}`;
  }

  /* ---------- Dados extraídos ---------- */
  const LIMITE_PREVIA = 300;
  function tabelaFrancesinha(lt) {
    const linhas = lt.registros.slice(0, LIMITE_PREVIA).map((r) => [esc(r.ref), `${r.pagina}/${r.linha}`, esc(r.nossoNumeroBruto), esc(r.seuNumero), c.reais(r.valorTitulo), c.reais(r.valorPago),
      r.tarifa == null ? '<span class="nota">não informada</span>' : c.reais(r.tarifa), c.br(r.dataPagamento), c.br(r.dataCredito)]);
    return c.tabela([{ t: 'Ref' }, { t: 'Pág./linha' }, { t: 'Nosso número' }, { t: 'Seu número' }, { t: 'Valor título', num: true }, { t: 'Valor pago', num: true }, { t: 'Tarifa', num: true }, { t: 'Pagamento' }, { t: 'Crédito' }], linhas);
  }
  function tabelaOfx(lt) {
    const cat = A.classificacaoOfx.CATEGORIAS;
    const banco = bancoAtual();
    const linhas = lt.registros.slice(0, LIMITE_PREVIA).map((r) => {
      const cl = A.classificacaoOfx.classificar(r, banco);
      return [esc(r.ref), c.br(r.data), c.reais(r.valor), esc(r.tipo), esc(r.fitid), esc(r.descricao), c.selo(cat[cl.categoria] || cl.categoria, cl.categoria === 'nao_classificado' ? 'amarelo' : '')];
    });
    return c.tabela([{ t: 'Ref' }, { t: 'Data' }, { t: 'Valor', num: true }, { t: 'Tipo' }, { t: 'FITID' }, { t: 'Descrição', quebra: true }, { t: 'Categoria' }], linhas);
  }
  function tabelaIxc(lt) {
    const linhas = lt.registros.slice(0, LIMITE_PREVIA).map((r) => [esc(r.ref), esc(r.idRecebimento), esc(r.idBoleto), esc(r.nossoNumeroBruto), c.reais(r.valorRecebido), c.br(r.dataPagamento), esc(r.conta), esc(r.forma)]);
    return c.tabela([{ t: 'Ref (linha)' }, { t: 'ID receb.' }, { t: 'ID boleto' }, { t: 'Nosso número' }, { t: 'Valor recebido', num: true }, { t: 'Pagamento' }, { t: 'Conta' }, { t: 'Forma' }], linhas);
  }

  function mapeamentoIxc(s) {
    const lt = s.leitura;
    const linhas = s.planilha.abas[s.aba].linhas;
    const amostra = (col) => { const v = linhas.slice((lt.linhaCabecalho || 0) + 1, (lt.linhaCabecalho || 0) + 4).map((l) => l[col]).filter((x) => x !== '' && x != null)[0]; return v == null ? '' : String(v).slice(0, 18); };
    const opcoesCol = (sel) => '<option value="">— não usar —</option>' + (lt.cabecalho || []).map((cab, k) =>
      `<option value="${k}" ${sel === k ? 'selected' : ''} ${(lt.pessoais || []).includes(k) ? 'disabled' : ''}>${esc(cab)}${(lt.pessoais || []).includes(k) ? ' (dado pessoal)' : amostra(k) ? ' — ex.: ' + esc(amostra(k)) : ''}</option>`).join('');
    const campos = A.leitorRecebimentos.CAMPOS;
    return `<details class="avancado" ${lt.status !== 'ok' ? 'open' : ''}><summary>Colunas do relatório do IXC (ajuste se algo estiver errado)</summary>
      <div class="grade-form">
        ${s.planilha.abas.length > 1 ? `<label class="campo">Aba<select data-acao="ixc-aba">${s.planilha.abas.map((a, k) => `<option value="${k}" ${k === s.aba ? 'selected' : ''}>${esc(a.nome)} (${a.linhas.length} linhas)</option>`).join('')}</select></label>` : ''}
        <label class="campo">Linha do cabeçalho<select data-acao="ixc-cabecalho">${linhas.slice(0, 25).map((l, k) => `<option value="${k}" ${k === lt.linhaCabecalho ? 'selected' : ''}>Linha ${k + 1}: ${esc(l.filter((x) => x !== '').slice(0, 3).join(' | ').slice(0, 50))}</option>`).join('')}</select></label>
        ${Object.entries(campos).map(([campo, def]) => `<label class="campo">${esc(def.rotulo)}<select data-acao="ixc-mapa" data-campo="${campo}">${opcoesCol(lt.mapa ? lt.mapa[campo] : undefined)}</select></label>`).join('')}
        ${lt.contas && lt.contas.length > 1 ? `<label class="campo">Filtrar conta<select data-acao="ixc-conta"><option value="">Todas</option>${lt.contas.map((x) => `<option ${s.opcoes.conta === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>` : ''}
      </div>
      <p class="nota">Colunas com dado pessoal (cliente, CPF/CNPJ…) nunca entram no cruzamento nem na IA. ${lt.pessoais && lt.pessoais.length ? 'Reconhecidas: ' + esc(lt.pessoais.map((k) => lt.cabecalho[k]).join(', ')) + '.' : ''}</p>
    </details>`;
  }

  function avisosLeitura(lt) {
    if (!lt) return '';
    const av = (lt.avisos || []).map((a) => (typeof a === 'string' ? a : a.texto));
    const ign = lt.ignoradas || [];
    return (av.length ? c.alerta('aviso', '<b>Avisos da leitura</b>' + c.lista(av)) : '') +
      (ign.length ? `<details class="avancado" open><summary>Linhas não lidas (${ign.length}) — não entram no cruzamento</summary>${c.tabela([{ t: 'Linha' }, { t: 'Motivo' }, { t: 'Conteúdo original', quebra: true }],
        ign.slice(0, 200).map((x) => [esc(x.pagina ? x.pagina + '/' + x.linha : x.linha), esc(x.motivo), esc(x.texto || (x.bruto ? Object.values(x.bruto).join(' | ') : ''))]))}</details>` : '');
  }

  function telaDados() {
    const e = UI.estado;
    const algum = ['francesinha', 'ofx', 'ixc'].some((t) => e.arquivos[t].leitura || e.arquivos[t].planilha);
    if (!algum) return `<header><h2><span class="passo">3</span>Dados extraídos</h2></header><p class="lead">Depois de enviar os arquivos, confira aqui o que foi lido de cada um.</p>
      <div class="linha-form"><button class="btn primario grande" data-acao="analisar" disabled>Executar cruzamento</button><span class="nota">Disponível quando os três arquivos estiverem lidos.</span></div>`;
    const aba = e.abaDados;
    const nomes = { francesinha: 'Francesinha', ofx: 'OFX', ixc: 'Recebimentos IXC' };
    const s = e.arquivos[aba];
    let corpo = '';
    if (aba === 'francesinha') corpo = s.leitura ? avisosLeitura(s.leitura) + (s.leitura.conferencia ? c.alerta(s.leitura.conferencia.confere ? 'ok' : 'aviso', s.leitura.conferencia.confere ? 'A soma dos títulos lidos confere com o total impresso no PDF.' : 'A soma dos títulos lidos não confere com o total impresso no PDF.') : '') + tabelaFrancesinha(s.leitura) : '';
    if (aba === 'ofx') corpo = s.leitura ? avisosLeitura(s.leitura) + `<p class="nota">Banco ${esc(s.leitura.conta.banco)} · ag. ${esc(s.leitura.conta.agencia || '—')} · conta ${esc(s.leitura.conta.numero || '—')} · créditos ${c.reais(s.leitura.resumo.creditos)} · débitos ${c.reais(-s.leitura.resumo.debitos)}</p>` + tabelaOfx(s.leitura) : '';
    if (aba === 'ixc' && s.planilha) corpo = (s.planilha.avisos.length ? `<p class="nota">${esc(s.planilha.avisos.join(' '))}</p>` : '') + mapeamentoIxc(s) + (s.leitura.status === 'ok' ? avisosLeitura(s.leitura) + tabelaIxc(s.leitura) : c.alerta('erro', esc(s.leitura.mensagem)));
    if (!corpo) corpo = `<div class="vazio">${s.erro ? esc(s.erro) : 'Arquivo ainda não enviado.'}</div>`;
    const total = s.leitura && s.leitura.registros ? s.leitura.registros.length : 0;
    return `<header><h2><span class="passo ${podeAnalisar() ? 'ok' : ''}">3</span>Dados extraídos</h2></header>
      <div class="abas" role="tablist">${Object.entries(nomes).map(([k, n]) => `<button role="tab" aria-selected="${k === aba}" data-acao="aba-dados" data-aba="${k}">${n}${e.arquivos[k].leitura && e.arquivos[k].leitura.registros ? ' (' + e.arquivos[k].leitura.registros.length + ')' : ''}</button>`).join('')}</div>
      ${corpo}
      ${total > LIMITE_PREVIA ? `<p class="nota">Mostrando ${LIMITE_PREVIA} de ${total} linhas. Todas entram no cruzamento.</p>` : ''}
      <div class="linha-form" style="margin-top:14px">
        <button class="btn primario grande" data-acao="analisar" ${podeAnalisar() && !e.rodando ? '' : 'disabled'}>${e.rodando ? 'Cruzando…' : e.analise ? 'Executar o cruzamento de novo' : 'Executar cruzamento'}</button>
        ${!podeAnalisar() ? '<span class="nota">Disponível quando os três arquivos estiverem lidos.</span>' : ''}
      </div>`;
  }

  /* =================== Eventos desta parte =================== */
  function aoMudar(el) {
    const e = UI.estado, ixc = e.arquivos.ixc;
    const a = el.dataset.acao;
    if (a === 'banco') { e.banco.manual = el.value || null; e.banco.credito = null; e.analise = null; return reprocessar(); }
    if (a === 'credito') { e.banco.credito[el.dataset.campo] = el.dataset.campo === 'toleranciaDias' ? Number(el.value) : el.value; e.analise = null; return UI.render(); }
    if (a === 'ixc-aba') { ixc.aba = Number(el.value); ixc.opcoes = {}; e.analise = null; return reprocessar(); }
    if (a === 'ixc-cabecalho') { ixc.opcoes = { linhaCabecalho: Number(el.value) }; e.analise = null; return reprocessar(); }
    if (a === 'ixc-mapa') {
      const mapa = Object.assign({}, ixc.leitura.mapa);
      if (el.value === '') delete mapa[el.dataset.campo]; else mapa[el.dataset.campo] = Number(el.value);
      ixc.opcoes = Object.assign({}, ixc.opcoes, { linhaCabecalho: ixc.leitura.linhaCabecalho, mapa });
      e.analise = null; return reprocessar();
    }
    if (a === 'ixc-conta') { ixc.opcoes = Object.assign({}, ixc.opcoes, { linhaCabecalho: ixc.leitura.linhaCabecalho, mapa: ixc.leitura.mapa, conta: el.value || undefined }); e.analise = null; return reprocessar(); }
    return false;
  }

  UI.arquivos = { receber, limpar, reprocessar, telaArquivos, telaBanco, telaDados, aoMudar, podeAnalisar, bancoAtual, vazio, TIPOS };
})(typeof self !== 'undefined' ? self : globalThis);

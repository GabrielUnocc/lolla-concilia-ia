/*
 * Modo Análise — etapa 4: resultado do cruzamento (resumo, categorias, filtros, linhas originais, exportação).
 */
(function (g) {
  const L = g.Lolla;
  const UI = L.ui.analise;
  const A = L.domain.analise;
  const c = UI.c;
  const { esc } = c;
  const POR_PAGINA = 150;

  function executar() {
    const e = UI.estado;
    const ar = e.arquivos;
    e.rodando = true; e.erroAnalise = '';
    UI.render();
    setTimeout(() => {           // deixa a tela mostrar "Cruzando…" antes do processamento
      try {
        const t = performance.now();
        const analise = A.motor.executar({
          francesinha: ar.francesinha.leitura.registros, ofx: ar.ofx.leitura.registros, ixc: ar.ixc.leitura.registros,
          banco: UI.arquivos.bancoAtual(), periodoOfx: ar.ofx.leitura.periodo
        });
        analise.ms = Math.round(performance.now() - t);
        analise.id = (g.crypto && g.crypto.randomUUID ? g.crypto.randomUUID() : 'a' + Date.now() + Math.random().toString(36).slice(2));
        analise.indice = A.resultado.indexar(analise);
        analise.avisosLeitura = ['francesinha', 'ofx', 'ixc'].flatMap((k) => (ar[k].leitura.avisos || []).map((a) => `${UI.arquivos.TIPOS[k].titulo}: ${typeof a === 'string' ? a : a.texto}`))
          .concat(analise.avisos.map((a) => a.texto));
        e.analise = analise;
        e.filtros = { grupo: 'todos', busca: '', etapa: '', status: '' };
        e.abertos = new Set(); e.limite = POR_PAGINA;
        e.ia.resultados = {}; e.ia.preparo = null; e.ia.problemas = []; e.ia.custos = [];
        if (!analise.cobertura.ok) e.erroAnalise = `${analise.cobertura.faltando.length} linha(s) lida(s) não foram classificadas: ${analise.cobertura.faltando.slice(0, 20).join(', ')}. A análise não está completa — avise o time da Lolla.`;
      } catch (err) {
        e.erroAnalise = 'Erro no cruzamento: ' + err.message;
        console.error(err);
      }
      e.rodando = false;
      UI.render();
      const el = document.getElementById('etapa-resultado'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 30);
  }

  /* ---------- Resumo ---------- */
  function kpis(an) {
    const s = an.resumo;
    const k = (rot, val, sub, tom) => `<div class="kpi ${tom || ''}"><div class="rot">${esc(rot)}</div><div class="val">${val}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>`;
    return `<div class="kpis">
      ${k('Banco', esc(s.banco), an.banco ? 'crédito: ' + an.banco.credito.modo + ', D+' + an.banco.credito.toleranciaDias : '')}
      ${k('Período analisado', s.periodo ? `${c.br(s.periodo.inicio)}<br>${c.br(s.periodo.fim)}` : '—')}
      ${k('Francesinha', s.qtd.francesinha, c.reais(s.totais.francesinhaPago))}
      ${k('OFX', s.qtd.ofx, 'créditos ' + c.reais(s.totais.ofxCreditos))}
      ${k('Recebimentos IXC', s.qtd.ixc, c.reais(s.totais.ixcRecebido))}
      ${k('Correspondências', s.correspondencias, s.linhasConciliadas + ' linha(s) conciliada(s)', 'bom')}
      ${k('Divergências', s.divergencias + s.atencao, s.atencao + ' de atenção (tarifa, D+1)', s.divergencias ? 'ruim' : 'bom')}
      ${k('Sem correspondência', s.semCorrespondencia, s.foraEscopo ? s.foraEscopo + ' saída(s) fora do escopo' : '', s.semCorrespondencia ? 'medio' : 'bom')}
    </div>`;
  }

  /* ---------- Registros de origem ---------- */
  function registro(ref, an, contexto) {
    const x = an.indice.get(ref);
    if (!x) return `<div class="reg">${esc(ref)} (não encontrado)</div>`;
    const par = (rot, v) => (v == null || v === '' ? '' : `<dt>${esc(rot)}</dt><dd>${v}</dd>`);
    let dl = '', original = '';
    if (x.origem === 'francesinha') {
      dl = par('Nosso número', esc(x.nossoNumeroBruto)) + par('Seu número', esc(x.seuNumero)) + par('Valor título', c.reais(x.valorTitulo)) + par('Valor pago', '<b>' + c.reais(x.valorPago) + '</b>') +
        par('Tarifa', x.tarifa == null ? '<span class="nota">não informada</span>' : c.reais(x.tarifa)) + (x.mora ? par('Mora', c.reais(x.mora)) : '') + (x.desconto ? par('Desconto', c.reais(x.desconto)) : '') +
        par('Pagamento', c.br(x.dataPagamento)) + par('Crédito', c.br(x.dataCredito)) + par('Origem', `página ${x.pagina}, linha ${x.linha}`);
      original = x.bruto;
    } else if (x.origem === 'ofx') {
      dl = par('Data', c.br(x.data)) + par('Valor', '<b>' + c.reais(x.valor) + '</b>') + par('Tipo', esc(x.tipo)) + par('FITID', esc(x.fitid)) + par('Documento', esc(x.documento)) +
        par('Descrição', esc(x.descricao)) + par('Categoria', esc((A.classificacaoOfx.CATEGORIAS[x.categoria] || x.categoria || '') + (x.regra ? ' (' + x.regra + ')' : ''))) + par('Origem', `lançamento ${x.linha} do OFX`);
      original = x.bruto;
    } else {
      dl = par('ID recebimento', esc(x.idRecebimento)) + par('ID boleto', esc(x.idBoleto)) + par('Nosso número', esc(x.nossoNumeroBruto)) + par('Valor recebido', '<b>' + c.reais(x.valorRecebido) + '</b>') +
        par('Pagamento', c.br(x.dataPagamento)) + (x.dataCredito ? par('Crédito', c.br(x.dataCredito)) : '') + par('Conta', esc(x.conta)) + par('Forma', esc(x.forma)) + par('Origem', `linha ${x.linha} do relatório`);
      original = Object.entries(x.bruto || {}).map(([k, v]) => `${k}: ${v}`).join(' | ');
    }
    return `<div class="reg ${contexto ? 'contexto' : ''}"><b>${esc(ref)}</b>${contexto ? ' <span class="nota">(crédito em que o título entrou)</span>' : ''}<dl>${dl}</dl>
      <details><summary class="nota">Linha original</summary><code class="original">${esc(original)}</code></details></div>`;
  }

  function fontes(i, an) {
    const col = (titulo, refs, ctx) => `<div class="fonte"><h4>${titulo}</h4>${refs.length ? refs.map((r) => registro(r, an)).join('') : (ctx && ctx.length ? '' : '<div class="nota">—</div>')}${(ctx || []).filter((r) => !refs.includes(r)).map((r) => registro(r, an, true)).join('')}</div>`;
    return `<div class="fontes">${col('Francesinha', i.refs.francesinha)}${col('Extrato OFX', i.refs.ofx, i.contexto && i.contexto.ofx)}${col('Recebimentos IXC', i.refs.ixc)}</div>`;
  }

  function blocoIa(id) {
    const r = UI.estado.ia.resultados[id];
    if (!r) return '';
    const tom = { alta: 'verde', media: 'amarelo', baixa: 'vermelho' }[r.certeza];
    return `<div class="ia-resp"><h4>Interpretação da IA ${c.selo('certeza ' + (r.certeza === 'media' ? 'média' : r.certeza), tom)}<span class="nota">sugestão — confira antes de agir</span></h4>
      <p><b>Causa provável:</b> ${esc(r.causa_provavel)}</p>
      ${r.explicacao ? `<p>${esc(r.explicacao)}</p>` : ''}
      ${r.linhas.length ? `<p class="nota">Linhas citadas: ${esc(r.linhas.join(', '))}</p>` : ''}
      <p><b>Próximo passo:</b> ${esc(r.proximo_passo)}</p>
      ${r.pergunta_ao_cliente ? `<p><b>Pergunta ao cliente:</b> ${esc(r.pergunta_ao_cliente)}</p>` : ''}</div>`;
  }

  function item(i, an) {
    const aberto = UI.estado.abertos.has(i.id);
    const v = i.valores || {};
    const valores = [v.francesinha != null ? 'F ' + c.reais(v.francesinha) : '', v.ofx != null ? 'E ' + c.reais(v.ofx) : '', v.ixc != null ? 'R ' + c.reais(v.ixc) : ''].filter(Boolean).join(' · ');
    const refs = [].concat(i.refs.francesinha, i.refs.ofx, i.refs.ixc);
    return `<details class="item st-${i.status}" data-item="${esc(i.id)}" ${aberto ? 'open' : ''}>
      <summary>
        <span>${c.seloClasse(i.classificacao)}</span>
        <span class="tit">${esc(i.titulo)}<small>${esc(i.id)} · etapa ${esc(i.etapa)}${UI.estado.ia.resultados[i.id] ? ' · ✦ IA' : ''}</small></span>
        <span class="val">${valores}${v.diferenca ? `<br><span class="nota">dif. ${c.reais(v.diferenca)}</span>` : ''}</span>
        <span class="refs">${esc(refs.join(', '))}${i.chave ? ' · chave ' + esc(i.chave) : ''}</span>
      </summary>
      ${aberto ? `<div class="corpo">
        <p class="motivo"><b>Motivo (regra ${esc(i.regra)}):</b> ${esc(i.motivo)}</p>
        ${i.acao ? `<p class="acao"><b>O que fazer:</b> ${esc(i.acao)}</p>` : ''}
        ${blocoIa(i.id)}
        ${fontes(i, an)}
      </div>` : ''}
    </details>`;
  }

  function lista() {
    const e = UI.estado, an = e.analise;
    const itens = A.resultado.filtrar(an, e.filtros, an.indice);
    const ordem = { divergente: 0, atencao: 1, fora_escopo: 2, ok: 3 };
    itens.sort((a, b) => (ordem[a.status] - ordem[b.status]) || 0);
    if (!itens.length) return '<div class="vazio">Nenhum item com esses filtros.</div>';
    return itens.slice(0, e.limite).map((i) => item(i, an)).join('') +
      (itens.length > e.limite ? `<button class="btn mais" data-acao="mais">Mostrar mais (${itens.length - e.limite} restantes)</button>` : '') +
      `<p class="nota" aria-live="polite">${Math.min(itens.length, e.limite)} de ${itens.length} item(ns) mostrados.</p>`;
  }

  function chips() {
    const e = UI.estado, an = e.analise;
    const filtroSemGrupo = Object.assign({}, e.filtros, { grupo: 'todos' });
    const base = A.resultado.filtrar(an, filtroSemGrupo, an.indice);
    const cont = { todos: base.length };
    base.forEach((i) => { cont[i.grupo] = (cont[i.grupo] || 0) + 1; });
    return [{ id: 'todos', nome: 'Todos' }].concat(A.motor.GRUPOS).map((gr) =>
      `<button class="chip ${cont[gr.id] ? '' : 'zero'}" aria-pressed="${e.filtros.grupo === gr.id}" data-acao="grupo" data-grupo="${gr.id}">${esc(gr.nome)} <b>${cont[gr.id] || 0}</b></button>`).join('');
  }

  function tela() {
    const e = UI.estado, an = e.analise;
    if (!an) {
      return `<header><h2><span class="passo">4</span>Resultado</h2></header>
        ${e.erroAnalise ? c.alerta('erro', esc(e.erroAnalise)) : '<p class="lead">O resultado do cruzamento aparece aqui: o que bate, o que não bate, por quê e o que fazer.</p>'}`;
    }
    const av = an.avisosLeitura || [];
    return `<header><h2><span class="passo ok">4</span>Resultado</h2><span class="sep"></span>
        <button class="btn" data-acao="copiar">📋 Copiar para o chamado</button>
        <button class="btn" data-acao="csv">⬇ Exportar CSV</button></header>
      ${e.erroAnalise ? c.alerta('erro', esc(e.erroAnalise)) : c.alerta('ok', `Todas as ${an.resumo.qtd.francesinha + an.resumo.qtd.ofx + an.resumo.qtd.ixc} linhas lidas foram classificadas (etapas ${an.etapas.join(', ')}, ${an.ms} ms). Os pares foram definidos pelas regras do código.`)}
      ${kpis(an)}
      ${av.length ? `<details class="avancado"><summary>Avisos da leitura e do cruzamento (${av.length})</summary>${c.lista(av)}</details>` : ''}
      <div class="chips" role="group" aria-label="Categorias" id="chips">${chips()}</div>
      <div class="barra">
        <input type="search" id="busca" placeholder="Pesquisar: nosso número, valor (99,90), ID, FITID, F:3, R:40…" value="${esc(e.filtros.busca)}" aria-label="Pesquisar nos resultados">
        <select data-acao="filtro-etapa" aria-label="Etapa"><option value="">Todas as etapas</option>${[['A', 'A · francesinha × IXC'], ['B', 'B · francesinha × OFX'], ['C', 'C · OFX × IXC'], ['D', 'D · sobras e duplicados']].map(([v, t]) => `<option value="${v}" ${e.filtros.etapa === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <select data-acao="filtro-status" aria-label="Situação"><option value="">Todas as situações</option>${[['divergente', 'Divergente'], ['atencao', 'Atenção'], ['ok', 'Conciliado'], ['fora_escopo', 'Fora do escopo']].map(([v, t]) => `<option value="${v}" ${e.filtros.status === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <button class="btn peq" data-acao="abrir-todos">Expandir todos</button><button class="btn peq" data-acao="fechar-todos">Recolher</button>
      </div>
      <div class="itens" id="lista-itens">${lista()}</div>`;
  }

  /* ---------- Exportação ---------- */
  function baixar(nome, conteudo, tipo) {
    const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
    const a = document.createElement('a');
    a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function nomeBase() {
    const s = UI.estado.analise.resumo;
    return `lolla-analise-${(s.banco || 'banco').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${s.periodo ? s.periodo.inicio + '_' + s.periodo.fim : 'periodo'}`;
  }
  function exportarCsv() { baixar(nomeBase() + '.csv', A.resultado.csv(UI.estado.analise, UI.estado.ia.resultados), 'text/csv;charset=utf-8'); UI.avisar('ok', 'CSV gerado.'); }
  async function copiar() {
    const txt = A.resultado.textoChamado(UI.estado.analise, UI.estado.ia.resultados);
    try { await navigator.clipboard.writeText(txt); UI.avisar('ok', 'Resumo copiado. Cole no chamado.'); }
    catch (err) { UI.dialogo('Copie o texto abaixo (Ctrl+C) e cole no chamado:', `<textarea readonly>${esc(txt)}</textarea>`); }
  }

  const htmlDoItem = (id) => item(UI.estado.analise.itens.find((i) => i.id === id), UI.estado.analise);

  UI.resultados = { htmlDoItem, executar, tela, lista, chips, exportarCsv, copiar, POR_PAGINA };
})(typeof self !== 'undefined' ? self : globalThis);

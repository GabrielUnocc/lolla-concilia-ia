/*
 * Modo Análise — saídas do resultado: filtro/pesquisa, CSV e texto para o chamado.
 * Funções puras; a interface só chama e mostra.
 */
(function (g) {
  const A = g.Lolla.domain.analise;

  // Índice ref -> registro (francesinha, OFX e IXC)
  function indexar(analise) {
    const m = new Map();
    ['francesinha', 'ofx', 'ixc'].forEach((k) => (analise.registros[k] || []).forEach((r) => m.set(r.ref, r)));
    return m;
  }

  function textoBusca(item, idx) {
    const refs = [].concat(item.refs.francesinha, item.refs.ofx, item.refs.ixc);
    const partes = [item.id, item.titulo, item.motivo, item.acao, item.chave, A.motor.CLASSIFICACOES[item.classificacao]].concat(refs);
    refs.forEach((r) => {
      const x = idx.get(r);
      if (!x) return;
      partes.push(x.nossoNumeroBruto, x.nossoNumero, x.seuNumero, x.fitid, x.documento, x.descricao, x.idBoleto, x.idRecebimento, x.conta, x.forma,
        A.norm.reais(x.valorPago != null ? x.valorPago : x.valor != null ? x.valor : x.valorRecebido));
    });
    return A.norm.chaveTexto(partes.filter(Boolean).join(' '));
  }

  // filtros: { grupo, busca, etapa, status }
  function filtrar(analise, filtros = {}, idx = indexar(analise)) {
    // "F:3", "E:12", "R:40" procuram a linha exata; o resto procura no texto (sem acento, sem pontuação)
    const brutos = String(filtros.busca || '').trim().split(/\s+/).filter(Boolean);
    const refs = brutos.filter((t) => /^[FER]:\d+$/i.test(t)).map((t) => t.toUpperCase());
    const termos = A.norm.chaveTexto(brutos.filter((t) => !/^[FER]:\d+$/i.test(t)).join(' ')).split(' ').filter(Boolean);
    return analise.itens.filter((i) => {
      if (filtros.grupo && filtros.grupo !== 'todos' && i.grupo !== filtros.grupo) return false;
      if (filtros.etapa && i.etapa !== filtros.etapa) return false;
      if (filtros.status && i.status !== filtros.status) return false;
      if (refs.length && !refs.every((r) => i.refs.francesinha.includes(r) || i.refs.ofx.includes(r) || i.refs.ixc.includes(r))) return false;
      if (!termos.length) return true;
      const t = textoBusca(i, idx);
      return termos.every((x) => t.includes(x));
    });
  }

  /* ---------- CSV ---------- */
  const celCsv = (v, texto) => {
    let s = v == null ? '' : String(v);
    if (texto && /^[=+\-@\t\r]/.test(s)) s = "'" + s;           // evita fórmula ao abrir no Excel
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const moedaCsv = (c) => (c == null || !isFinite(c) ? '' : (c / 100).toFixed(2).replace('.', ','));

  function csv(analise, iaPorItem = {}) {
    const idx = indexar(analise);
    const cab = ['item', 'grupo', 'classificacao', 'status', 'etapa', 'regra', 'titulo', 'motivo', 'proximo_passo',
      'origem', 'ref', 'pagina', 'linha', 'data', 'data_credito', 'valor', 'nosso_numero', 'seu_numero', 'id_boleto', 'id_recebimento', 'fitid', 'documento_ofx', 'descricao_ofx', 'categoria_ofx', 'conta_ixc',
      'ia_causa', 'ia_certeza', 'ia_proximo_passo'];
    const linhas = [cab.join(';')];
    const grupoNome = Object.fromEntries(A.motor.GRUPOS.map((x) => [x.id, x.nome]));
    analise.itens.forEach((i) => {
      const ia = iaPorItem[i.id] || {};
      const refs = [].concat(i.refs.francesinha, i.refs.ofx, i.refs.ixc);
      refs.forEach((ref) => {
        const x = idx.get(ref) || {};
        const origem = ref[0] === 'F' ? 'francesinha' : ref[0] === 'E' ? 'ofx' : 'ixc';
        const valor = origem === 'francesinha' ? x.valorPago : origem === 'ofx' ? x.valor : x.valorRecebido;
        const data = origem === 'francesinha' ? x.dataPagamento : origem === 'ofx' ? x.data : x.dataPagamento;
        const v = [i.id, grupoNome[i.grupo], A.motor.CLASSIFICACOES[i.classificacao], i.status, i.etapa, i.regra, i.titulo, i.motivo, i.acao || '',
          origem, ref, x.pagina || '', x.linha || '', data || '', x.dataCredito || '', moedaCsv(valor), x.nossoNumeroBruto || '', x.seuNumero || '', x.idBoleto || '', x.idRecebimento || '',
          x.fitid || '', x.documento || '', x.descricao || '', x.categoria ? (A.classificacaoOfx.CATEGORIAS[x.categoria] || x.categoria) : '', x.conta || '',
          ia.causa_provavel || '', ia.certeza || '', ia.proximo_passo || ''];
        linhas.push(v.map((c, k) => celCsv(c, ![15].includes(k))).join(';'));
      });
    });
    return '﻿' + linhas.join('\r\n') + '\r\n';
  }

  /* ---------- Texto para o chamado ---------- */
  function textoChamado(analise, iaPorItem = {}, opcoes = {}) {
    const n = A.norm, R$ = (c) => 'R$ ' + n.reais(c), br = n.brDeIso;
    const s = analise.resumo;
    const limite = opcoes.limitePorGrupo || 40;
    const out = [];
    out.push('ANÁLISE DE CONCILIAÇÃO — AR Lolla (Modo Análise)');
    out.push(`Banco: ${s.banco}${analise.banco && analise.banco.credito ? '' : ''} | Período: ${s.periodo ? br(s.periodo.inicio) + ' a ' + br(s.periodo.fim) : '—'}`);
    out.push(`Arquivos: francesinha ${s.qtd.francesinha} título(s) · OFX ${s.qtd.ofx} lançamento(s) · recebimentos IXC ${s.qtd.ixc}`);
    out.push('');
    out.push('RESUMO');
    out.push(`- Conciliados: ${s.correspondencias} | Atenção: ${s.atencao} | Divergências: ${s.divergencias} | Sem correspondência: ${s.semCorrespondencia}${s.foraEscopo ? ' | Fora do escopo (saídas): ' + s.foraEscopo : ''}`);
    out.push(`- Totais: francesinha ${R$(s.totais.francesinhaPago)} · créditos OFX ${R$(s.totais.ofxCreditos)} · débitos OFX ${R$(s.totais.ofxDebitos)} · recebido IXC ${R$(s.totais.ixcRecebido)}`);
    if (analise.parcial) out.push('- Análise parcial: nem todos os arquivos foram cruzados.');
    out.push('');
    const pendentes = analise.itens.filter((i) => i.status !== 'ok' && i.status !== 'fora_escopo');
    if (!pendentes.length) out.push('Nenhuma divergência encontrada: todos os registros foram conciliados pelas regras do código.');
    A.motor.GRUPOS.filter((gr) => gr.id !== 'conciliados').forEach((gr) => {
      const its = pendentes.filter((i) => i.grupo === gr.id);
      if (!its.length) return;
      out.push(`${gr.nome.toUpperCase()} (${its.length})`);
      its.slice(0, limite).forEach((i) => {
        const refs = [].concat(i.refs.francesinha, i.refs.ofx, i.refs.ixc).join(', ');
        out.push(`- [${i.id}] ${i.titulo}: ${i.motivo}`);
        out.push(`  Linhas: ${refs}`);
        const ia = iaPorItem[i.id];
        if (ia) {
          out.push(`  Causa provável (IA, certeza ${ia.certeza}): ${ia.causa_provavel}`);
          if (ia.pergunta_ao_cliente) out.push(`  Pergunta ao cliente: ${ia.pergunta_ao_cliente}`);
        }
        const passo = (ia && ia.proximo_passo) || i.acao;
        if (passo) out.push(`  Próximo passo: ${passo}`);
      });
      if (its.length > limite) out.push(`- … e mais ${its.length - limite} item(ns) (ver CSV).`);
      out.push('');
    });
    const passos = Array.from(new Set(pendentes.map((i) => (iaPorItem[i.id] && iaPorItem[i.id].proximo_passo) || i.acao).filter(Boolean)));
    if (passos.length) {
      out.push('PRÓXIMOS PASSOS');
      passos.slice(0, 15).forEach((p) => out.push('- ' + p));
      out.push('');
    }
    out.push('Legenda das linhas: F = francesinha, E = extrato OFX, R = linha do relatório de recebimentos do IXC.');
    out.push('Pareamento feito pelas regras do código' + (Object.keys(iaPorItem).length ? '; causas prováveis sugeridas pela IA e conferidas pelo suporte.' : '.'));
    return out.join('\n');
  }

  A.resultado = { indexar, filtrar, csv, textoChamado };
})(typeof self !== 'undefined' ? self : globalThis);

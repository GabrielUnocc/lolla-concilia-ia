/*
 * Leitor da tela de Conciliação Manual do IXC.
 * Lê as grades pelo atributo abbr (fn_movim_finan.* / fn_extrato.*), nunca pela posição da coluna,
 * e os totais do rodapé (#total_a_conciliar_aba3_mov etc., valores em input.value).
 * Só lê: não clica, não altera nada no IXC (exceto destacar/selecionar quando o usuário pede).
 */
Lolla.ixcTela = (function () {
  const fmt = Lolla.core.fmt;
  const SEL_MOV = 'table[id^="grid_lancamentos_aba_"]';
  const SEL_EXT = 'table[id^="grid_lancamentos_OFX_"]';

  // A janela de conciliação tem várias abas (Automática, Manual, Todos os conciliados...).
  // Lê só a aba que está visível agora, e o extrato e o rodapé da MESMA aba (mesmo número no id).
  const visivel = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  let abaAtual = '';
  function encontrar() {
    const movs = Array.from(document.querySelectorAll(SEL_MOV));
    const mov = movs.find(visivel) || null;
    abaAtual = mov ? mov.id.replace('grid_lancamentos_aba_', '') : '';
    const ext = mov ? (document.getElementById('grid_lancamentos_OFX_' + abaAtual) || Array.from(document.querySelectorAll(SEL_EXT)).find(visivel) || null) : null;
    return { mov, ext, aba: abaAtual, ok: !!(mov && ext) };
  }

  function lerGrade(tabela, prefixo, lado) {
    if (!tabela) return [];
    return Array.from(tabela.querySelectorAll('tbody tr')).map((tr) => {
      const l = {};
      tr.querySelectorAll('td[abbr^="' + prefixo + '."]').forEach((td) => {
        const campo = td.getAttribute('abbr').split('.')[1];
        if (campo === 'conciliado') l.conciliado = !td.querySelector('.fa-times');
        else l[campo] = (td.textContent || '').trim();
      });
      if (!l.id) return null; // linha de "nenhum registro" ou de carregamento
      const credito = fmt.centavosBR(l.credito), debito = fmt.centavosBR(l.debito);
      return {
        lado, id: l.id, conciliado: !!l.conciliado, data: fmt.isoDeBR(l.data),
        documento: l.documento || '', tx_id: l.tx_id || '', credito, debito, valor: credito - debito,
        historico: l.historico || '', origem: '', cliente: ''
      };
    }).filter(Boolean);
  }

  const valorCampo = (seletor) => {
    const el = document.querySelector(seletor);
    if (!el) return null;
    const v = (el.value != null ? el.value : el.textContent || '').trim();
    return v === '' ? null : fmt.centavosBR(v);
  };

  // Rodapé da aba atual (ex.: #total_a_conciliar_aba3_mov); se não achar, cai no primeiro que existir
  function lerRodape() {
    const n = abaAtual;
    const campo = (exato, prefixo, sufixo) => {
      const v = n ? valorCampo('#' + exato) : null;
      return v != null ? v : valorCampo(`[id^="${prefixo}"]${sufixo ? `[id$="${sufixo}"]` : ''}`);
    };
    return {
      aConciliarMov: campo(`total_a_conciliar_aba${n}_mov`, 'total_a_conciliar_aba', '_mov'),
      aConciliarExt: campo(`total_a_conciliar_aba${n}_ext`, 'total_a_conciliar_aba', '_ext'),
      diferenca: campo(`diferenca_aba${n}`, 'diferenca_aba', ''),
      selecionadoMov: campo(`total_selecionado_aba${n}_mov`, 'total_selecionado_aba', '_mov'),
      selecionadoExt: campo(`total_selecionado_aba${n}_ext`, 'total_selecionado_aba', '_ext')
    };
  }

  function ler() {
    const g = encontrar();
    const movimentacao = lerGrade(g.mov, 'fn_movim_finan', 'ixc');
    const extrato = lerGrade(g.ext, 'fn_extrato', 'banco');
    const rodape = lerRodape();
    const assinatura = JSON.stringify([movimentacao.map((l) => [l.id, l.conciliado, l.valor, l.data]), extrato.map((l) => [l.id, l.conciliado, l.valor, l.data]),
      rodape.aConciliarMov, rodape.aConciliarExt]);
    return { ok: g.ok, aba: g.aba, movimentacao, extrato, rodape, assinatura };
  }

  // Confere o que a Lolla leu com o rodapé do IXC (teste 1 do projeto)
  function conferir(leitura) {
    const pend = (arr) => arr.filter((l) => !l.conciliado);
    const liq = (arr) => pend(arr).reduce((a, l) => a + l.valor, 0);
    const bruto = (arr) => pend(arr).reduce((a, l) => a + Math.abs(l.valor), 0);
    const r = leitura.rodape;
    const lado = (lidoArr, ixcValor) => {
      if (ixcValor == null) return { ixc: null, lido: liq(lidoArr), confere: null };
      const ok = [liq(lidoArr), bruto(lidoArr), -liq(lidoArr)].includes(ixcValor);
      return { ixc: ixcValor, lido: liq(lidoArr), confere: ok };
    };
    return { mov: lado(leitura.movimentacao, r.aConciliarMov), ext: lado(leitura.extrato, r.aConciliarExt), diferencaIxc: r.diferenca };
  }

  /* ---------- Ações visuais pedidas pelo usuário ---------- */
  function linha(ref) {
    const g = encontrar();
    const [lado, id] = [ref.slice(0, 1), ref.slice(2)];
    const tabela = lado === 'M' ? g.mov : g.ext;
    if (!tabela) return null;
    return Array.from(tabela.querySelectorAll('tbody tr')).find((tr) => {
      const td = tr.querySelector('td[abbr$=".id"]');
      return td && td.textContent.trim() === id;
    }) || null;
  }

  let destacadas = [];
  function destacar(refs) {
    destacadas.forEach(({ tr, estilo }) => { tr.style.cssText = estilo; });
    destacadas = [];
    const trs = refs.map(linha).filter(Boolean);
    trs.forEach((tr) => {
      destacadas.push({ tr, estilo: tr.style.cssText });
      tr.style.outline = '2px solid #e0a800';
      tr.style.outlineOffset = '-2px';
      tr.style.background = '#fff4cc';
    });
    if (trs[0]) trs[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    return trs.length;
  }

  // Marca as caixinhas das linhas no IXC (o IXC soma e fica verde/laranja). Não concilia.
  function selecionar(refs) {
    let n = 0;
    refs.map(linha).filter(Boolean).forEach((tr) => {
      const cb = tr.querySelector('input[type="checkbox"]');
      if (cb && !cb.checked) { cb.click(); n++; }
      else if (!cb && !tr.classList.contains('trSelected')) { tr.click(); n++; }
    });
    return n;
  }

  return { encontrar, ler, conferir, destacar, selecionar };
})();

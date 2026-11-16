/*
 * Painel flutuante da Lolla (dentro de um Shadow DOM, para não misturar estilos com o IXC).
 */
Lolla.painel = (function () {
  const { esc, reais, brDeIso } = Lolla.core.fmt;
  const AVATAR = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) ? chrome.runtime.getURL('icones/lolla-avatar.png') : '';
  const avatar = (cls) => AVATAR ? `<img class="${cls}" src="${AVATAR}" alt="Lolla (visual em breve)">` : '';

  const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .base { font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1d2733; }
  button { font: inherit; cursor: pointer; border: 1px solid #d9dfe7; background: #fff; color: #1d2733; padding: 5px 10px; border-radius: 6px; }
  button:hover:not(:disabled) { border-color: #1f5fa8; }
  button:disabled { opacity: .45; cursor: not-allowed; }
  button:focus-visible, input:focus-visible { outline: 2px solid #1f5fa8; outline-offset: 2px; }
  .primario { background: #1f5fa8; border-color: #1f5fa8; color: #fff; }
  .lancador { position: fixed; right: 18px; bottom: 18px; z-index: 2147483646; display: flex; gap: 8px; align-items: center;
    background: rgba(18,53,95,.86); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); color: #fff;
    border: 1px solid rgba(255,255,255,.25); border-radius: 26px; padding: 5px 16px 5px 5px; box-shadow: 0 8px 24px rgba(18,53,95,.35); font-weight: 600; }
  .lancador .av { width: 34px; height: 34px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(255,255,255,.8); }
  .lancador i { width: 9px; height: 9px; border-radius: 50%; background: #e07b24; display: inline-block; }
  .cab .av { width: 36px; height: 36px; border-radius: 10px; object-fit: cover; border: 1px solid rgba(255,255,255,.5); }
  .breve { font-size: 10px; background: rgba(224,123,36,.9); color: #fff; border-radius: 8px; padding: 0 6px; margin-left: 6px; vertical-align: 2px; font-weight: 600; }
  .painel { position: fixed; top: 12px; right: 12px; bottom: 12px; width: 410px; max-width: calc(100vw - 24px); z-index: 2147483646;
    background: rgba(243,245,248,.80); -webkit-backdrop-filter: blur(18px) saturate(140%); backdrop-filter: blur(18px) saturate(140%); border: 1px solid rgba(255,255,255,.7); border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.25); display: flex; flex-direction: column; overflow: hidden; }
  .cab { background: linear-gradient(135deg, rgba(18,53,95,.95), rgba(31,95,168,.9)); color: #fff; padding: 10px 12px; display: flex; align-items: center; gap: 8px; }
  .cab b { font-size: 15px; } .cab small { opacity: .8; display: block; font-size: 11px; }
  .cab .sep { flex: 1; } .cab button { background: transparent; color: #fff; border-color: rgba(255,255,255,.35); padding: 3px 9px; }
  .corpo { overflow: auto; padding: 10px 12px 16px; display: flex; flex-direction: column; gap: 10px; }
  .bloco { background: rgba(255,255,255,.78); border: 1px solid rgba(217,223,231,.9); border-radius: 8px; padding: 10px; }
  .bloco h4 { margin: 0 0 6px; font-size: 13px; }
  .vivo { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #2e8b57; }
  .vivo i { width: 8px; height: 8px; border-radius: 50%; background: #2e8b57; animation: pulso 1.6s infinite; }
  @keyframes pulso { 50% { opacity: .3; } }
  @media (prefers-reduced-motion: reduce) { .vivo i { animation: none; } }
  .grade2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .num { font-variant-numeric: tabular-nums; }
  .kpi { background: #f7f9fb; border-radius: 6px; padding: 6px 8px; }
  .kpi span { display: block; font-size: 11px; color: #5b6878; } .kpi b { font-size: 15px; }
  .kpi.ok { background: #e3f3ea; } .kpi.nok { background: #fdeedf; }
  .conf { font-size: 12px; margin-top: 6px; display: flex; flex-direction: column; gap: 2px; }
  .ok-t { color: #2e8b57; } .nok-t { color: #b4400f; } .suave { color: #5b6878; font-size: 12px; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .chip { background: #eef1f5; border-radius: 10px; padding: 1px 8px; font-size: 11px; font-weight: 600; color: #5b6878; }
  .chip.verde { background: #e3f3ea; color: #2e8b57; } .chip.azul { background: #e5eefb; color: #2f6fd1; }
  .chip.laranja { background: #fdeedf; color: #b45d14; } .chip.vermelho { background: #fbe7e5; color: #c0392b; } .chip.amarelo { background: #fbf3d6; color: #8a6a00; }
  ul.sobras { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  ul.sobras li button { width: 100%; text-align: left; border: 0; background: transparent; padding: 4px 6px; display: grid; grid-template-columns: 70px 1fr auto; gap: 6px; }
  ul.sobras li button:hover { background: #f2f7fd; }
  ul.sobras .h { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #5b6878; }
  .resumo { background: #f2f7fd; border-left: 3px solid #1f5fa8; padding: 8px 10px; border-radius: 4px; }
  .card { border: 1px solid #d9dfe7; border-radius: 8px; padding: 8px 10px; background: #fff; display: flex; flex-direction: column; gap: 6px; }
  .card.aceita { border-color: #2e8b57; background: #f6fbf8; } .card.rejeitada { opacity: .7; background: #fdf7f6; }
  .card p { margin: 0; } .card .acoes { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .card .acoes button { padding: 3px 8px; font-size: 12px; }
  .ok-b { border-color: #2e8b57; color: #2e8b57; } .nok-b { border-color: #c0392b; color: #c0392b; }
  code { font: 11px ui-monospace, Menlo, Consolas, monospace; background: #f0f2f5; padding: 1px 4px; border-radius: 3px; }
  .alerta { padding: 8px 10px; border-radius: 6px; background: #fbe7e5; color: #8e2a20; }
  .aviso { padding: 8px 10px; border-radius: 6px; background: #fff6e5; color: #7a4d00; }
  .msgs { display: flex; flex-direction: column; gap: 4px; max-height: 200px; overflow: auto; margin-bottom: 6px; }
  .msg { padding: 6px 8px; border-radius: 8px; white-space: pre-wrap; max-width: 90%; }
  .msg.usuario { align-self: flex-end; background: #e6f0fb; } .msg.lolla { background: #f2f4f7; } .msg.erro { background: #fbe7e5; color: #c0392b; }
  form.chat { display: flex; gap: 6px; } form.chat input { flex: 1; font: inherit; padding: 5px 8px; border: 1px solid #d9dfe7; border-radius: 6px; }
  .giro { width: 14px; height: 14px; border: 2px solid #d9dfe7; border-top-color: #1f5fa8; border-radius: 50%; animation: g .8s linear infinite; display: inline-block; vertical-align: -2px; margin-right: 6px; }
  @keyframes g { to { transform: rotate(360deg); } }
  .toast { position: fixed; right: 440px; bottom: 20px; background: #2e8b57; color: #fff; padding: 8px 12px; border-radius: 8px; z-index: 2147483647; }
  .toast.erro { background: #c0392b; }
  `;

  const tomTipo = { identificador: 'verde', 'valor + data': 'verde', lote: 'azul' };
  const tomCerteza = { alta: 'verde', media: 'amarelo', baixa: 'laranja' };

  function lancador(s) {
    const n = s.ind ? s.ind.sobrasIxc + s.ind.sobrasBanco : null;
    return `<button class="lancador base" data-a="abrir" title="Abrir a Lolla">${avatar('av')}<i></i>Lolla${n != null ? ` · ${n} sobra(s)` : ''}</button>`;
  }

  function listaSobras(linhas, prefixo) {
    if (!linhas.length) return '<p class="suave">Nenhuma.</p>';
    return `<ul class="sobras">${linhas.slice(0, 40).map((l) => `<li><button data-a="mostrar" data-refs="${esc(prefixo + l.id)}" title="Mostrar no IXC">
      <span>${brDeIso(l.data)}</span><span class="h">${esc(l.historico || l.documento)}</span><span class="num">${esc(reais(l.valor))}</span></button></li>`).join('')}
      ${linhas.length > 40 ? `<li class="suave">+ ${linhas.length - 40} linha(s)</li>` : ''}</ul>`;
  }

  function blocoIA(s) {
    const st = s.status || {};
    const rotulo = st.iaSimulada ? 'IA simulada (regras locais)' : 'Claude · ' + esc(st.modelo || '');
    let corpo = '';
    if (s.analisando) corpo = '<p><span class="giro"></span>Analisando as sobras…</p>';
    else if (s.erroIA) corpo = `<div class="alerta">${esc(s.erroIA)}</div>`;
    else if (s.analise) {
      const a = s.analise, r = a.resultado;
      corpo = `${a.desatualizada ? '<div class="aviso">A tela mudou depois desta análise. Analise de novo para atualizar.</div>' : ''}
        <div class="resumo">${esc(r.resumo || '')}</div>
        ${r.perguntas_ao_cliente.length ? `<div class="aviso"><b>Perguntar ao cliente:</b> ${r.perguntas_ao_cliente.map(esc).join(' · ')}</div>` : ''}
        ${r.itens.map((it, k) => {
          const d = a.decisoes[k], refs = (it.refs || []).join(',');
          return `<div class="card ${d || ''}">
            <div class="chips"><span class="chip azul">${esc(it.categoria || 'outra')}</span><span class="chip ${tomCerteza[it.certeza] || ''}">certeza ${esc(it.certeza || '?')}</span>
              ${(it.refs || []).map((x) => `<code>${esc(x)}</code>`).join(' ')}</div>
            <p><b>Causa:</b> ${esc(it.causa)}</p><p><b>Próximo passo:</b> ${esc(it.proximo_passo)}</p>
            <div class="acoes"><button data-a="mostrar" data-refs="${esc(refs)}">Mostrar</button>
              <button data-a="selecionar" data-refs="${esc(refs)}" title="Marca as caixinhas no IXC; não concilia">Selecionar no IXC</button>
              ${d ? `<span class="suave">Sugestão ${esc(d)}</span> <button data-a="decidir" data-k="${k}" data-d="">Desfazer</button>`
                  : `<button class="ok-b" data-a="decidir" data-k="${k}" data-d="aceita">Aceitar</button><button class="nok-b" data-a="decidir" data-k="${k}" data-d="rejeitada">Rejeitar</button>`}
            </div></div>`;
        }).join('')}
        <div><button data-a="copiar">Copiar resumo para o atendimento</button>
          ${a.usage ? `<span class="suave"> ${a.usage.input_tokens} + ${a.usage.output_tokens} tokens</span>` : ''}</div>
        <div><div class="msgs">${s.chat.map((m) => `<div class="msg ${m.papel}">${esc(m.texto)}</div>`).join('')}${s.conversando ? '<div class="msg lolla">…</div>' : ''}</div>
          <form class="chat" data-f="chat"><input id="lolla-chat" autocomplete="off" placeholder="Pergunte sobre esta análise…" ${s.conversando ? 'disabled' : ''}><button class="primario" ${s.conversando ? 'disabled' : ''}>Enviar</button></form></div>`;
    }
    const nada = s.ind && !s.ind.sobrasIxc && !s.ind.sobrasBanco && !(s.pareamento.duplicados || []).length && !s.ind.ambiguos;
    return `<div class="bloco"><h4>Análise da Lolla</h4><p class="suave">${rotulo} · só valor, data, documento, IDs e histórico mascarado vão para a IA.</p>
      <p><button class="primario" data-a="analisar" ${s.analisando || nada || !s.ind ? 'disabled' : ''}>${nada ? 'Nada para analisar: tudo pareado' : s.analise ? 'Analisar de novo' : 'Analisar sobras com IA'}</button></p>
      ${corpo}</div>`;
  }

  function painel(s) {
    const hora = s.atualizadoEm ? new Date(s.atualizadoEm).toLocaleTimeString('pt-BR') : '—';
    let corpo;
    if (!s.ind) corpo = '<div class="bloco"><p><span class="giro"></span>Lendo a Conciliação Manual…</p></div>';
    else {
      const i = s.ind, c = s.conferencia;
      const pend = (arr) => arr.filter((l) => !l.conciliado).length;
      const linhaConf = (rot, x) => x.ixc == null ? `<span class="suave">${rot}: o IXC não mostrou o total</span>`
        : x.confere ? `<span class="ok-t">✓ ${rot}: confere com o IXC (${esc(reais(x.ixc))})</span>`
          : `<span class="nok-t">✗ ${rot}: IXC mostra ${esc(reais(x.ixc))}, Lolla leu ${esc(reais(x.lido))}</span>`;
      const tipos = Object.entries(i.paresPorTipo).map(([t, n]) => `<span class="chip ${tomTipo[t] || ''}">${esc(t)}: ${n}</span>`).join('');
      corpo = `<div class="bloco">
          <div class="vivo"><i></i>Lendo a tela automaticamente · atualizado às ${hora}</div>
          <div class="grade2" style="margin-top:6px">
            <div class="kpi"><span>IXC pendentes</span><b class="num">${pend(s.leitura.movimentacao)}</b> <span>${s.leitura.movimentacao.length} na grade</span></div>
            <div class="kpi"><span>Banco pendentes</span><b class="num">${pend(s.leitura.extrato)}</b> <span>${s.leitura.extrato.length} na grade</span></div>
            <div class="kpi"><span>A conciliar IXC / banco</span><b class="num">${esc(reais(i.totalIxc))}</b> <span class="num">${esc(reais(i.totalBanco))}</span></div>
            <div class="kpi ${i.diferenca ? 'nok' : 'ok'}"><span>Diferença (IXC − banco)</span><b class="num">${esc(reais(i.diferenca))}</b></div>
          </div>
          <div class="conf">${linhaConf('Movimentação', c.mov)}${linhaConf('Extrato', c.ext)}</div>
        </div>
        <div class="bloco"><h4>Pareamento em código</h4>
          <p class="suave">${i.linhasPareadas} de ${i.linhasPendentes} linhas pendentes pareadas (${Math.round(i.taxaAutomatica * 100)}%)</p>
          <div class="chips">${tipos || '<span class="chip">nenhum par</span>'}
            ${i.ambiguos ? `<span class="chip amarelo">ambíguos: ${i.ambiguos}</span>` : ''}
            ${s.pareamento.duplicados.length ? `<span class="chip vermelho">duplicados no IXC: ${s.pareamento.duplicados.length}</span>` : ''}
            ${(s.pareamento.duplicadosOfx || []).length ? `<span class="chip vermelho">repetidos no OFX: ${s.pareamento.duplicadosOfx.length}</span>` : ''}</div>
        </div>
        <div class="bloco"><h4>Sobras só no IXC (${s.pareamento.soNoIxc.length})</h4>${listaSobras(s.pareamento.soNoIxc, 'M:')}</div>
        <div class="bloco"><h4>Sobras só no banco (${s.pareamento.soNoBanco.length})</h4>${listaSobras(s.pareamento.soNoBanco, 'E:')}</div>
        ${blocoIA(s)}`;
    }
    return `<div class="painel base" role="dialog" aria-label="AR Lolla">
      <div class="cab">${avatar('av')}<div><b>AR Lolla</b><span class="breve" title="A aparência da Lolla ainda vai ser definida">visual em breve</span><small>Conciliação com IA</small></div><span class="sep"></span>
        <button data-a="minimizar" title="Minimizar">–</button></div>
      <div class="corpo">${corpo}</div>
      ${s.aviso ? `<div class="toast ${s.aviso.tipo}">${esc(s.aviso.texto)}</div>` : ''}</div>`;
  }

  return { CSS, lancador, painel };
})();

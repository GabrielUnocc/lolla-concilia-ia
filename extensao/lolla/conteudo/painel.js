/*
 * Painel flutuante da Lolla (dentro de um Shadow DOM, para não misturar estilos com o IXC).
 */
Lolla.painel = (function () {
  const { esc, reais, brDeIso } = Lolla.core.fmt;
  const AVATAR = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) ? chrome.runtime.getURL('icones/lolla-avatar.png') : '';
  const avatar = (cls) => AVATAR ? `<img class="${cls}" src="${AVATAR}" alt="Lolla (visual em breve)">` : '';

  const CSS = `
  :host { all: initial;
    /* Vidro fosco (linguagem do Flowly), tema claro */
    --acento: #2f6fed; --acento-2: #5b93f7; --acento-suave: rgba(47,111,237,.12);
    --vidro: rgba(255,255,255,.26); --vidro-forte: rgba(255,255,255,.66); --vidro-suave: rgba(255,255,255,.44);
    --topo: linear-gradient(180deg, rgba(36,74,190,.94) 0, rgba(52,104,230,.78) 64px, rgba(70,125,240,.36) 150px, rgba(90,140,245,.10) 240px, rgba(90,140,245,0) 320px);
    --brilho: linear-gradient(125deg, rgba(255,255,255,.42) 0%, rgba(255,255,255,.10) 32%, rgba(255,255,255,0) 55%);
    --vidro-bloco: linear-gradient(160deg, rgba(255,255,255,.62), rgba(255,255,255,.30));
    --borda-bloco: rgba(255,255,255,.75); --realce: inset 0 1px 0 rgba(255,255,255,.95);
    --borda: rgba(255,255,255,.90); --borda-suave: rgba(150,170,215,.32);
    --desfoque: blur(26px) saturate(190%) brightness(1.05);
    --sombra: 0 12px 48px rgba(40,70,160,.18), 0 2px 0 rgba(255,255,255,.95) inset, 0 0 0 1px rgba(255,255,255,.6) inset;
    --sombra-card: 0 1px 8px rgba(40,70,160,.06), 0 0 0 1px rgba(255,255,255,.85) inset;
    --cena: radial-gradient(520px 320px at 0% 0%, rgba(47,111,237,.16), transparent 65%), radial-gradient(420px 300px at 100% 100%, rgba(56,189,248,.14), transparent 65%);
    --tinta: #0f1a2e; --tinta-2: #3d4a66; --tinta-3: #6f7c99;
    --verde: #1f9d5c; --verde-f: rgba(31,157,92,.12); --laranja: #c26414; --laranja-f: rgba(224,123,36,.14);
    --vermelho: #c0392b; --vermelho-f: rgba(192,57,43,.11); --amarelo: #8a6a00; --amarelo-f: rgba(232,190,40,.18);
    --superficie: #ffffff; --cab: linear-gradient(135deg, rgba(18,53,95,.92), rgba(47,111,237,.85));
  }
  /* Tema escuro: segue o modo escuro do IXC */
  :host([data-tema="escuro"]) {
    --acento: #5b93f7; --acento-2: #8cb4ff; --acento-suave: rgba(91,147,247,.16);
    --vidro: rgba(10,14,32,.42); --vidro-forte: rgba(24,30,60,.72); --vidro-suave: rgba(30,38,72,.46);
    --topo: linear-gradient(180deg, rgba(40,46,170,.95) 0, rgba(48,58,190,.72) 64px, rgba(56,70,200,.32) 150px, rgba(60,80,210,.08) 240px, rgba(60,80,210,0) 320px);
    --brilho: linear-gradient(125deg, rgba(255,255,255,.10) 0%, rgba(255,255,255,.03) 32%, rgba(255,255,255,0) 55%);
    --vidro-bloco: linear-gradient(160deg, rgba(40,50,95,.55), rgba(18,22,48,.40));
    --borda-bloco: rgba(255,255,255,.12); --realce: inset 0 1px 0 rgba(255,255,255,.10);
    --borda: rgba(255,255,255,.09); --borda-suave: rgba(120,140,200,.20);
    --desfoque: blur(26px) saturate(170%) brightness(1.08);
    --sombra: 0 12px 48px rgba(0,0,0,.65), 0 1px 0 rgba(255,255,255,.07) inset, 0 0 0 1px rgba(255,255,255,.04) inset;
    --sombra-card: 0 1px 8px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.05) inset;
    --cena: radial-gradient(520px 320px at 0% 0%, rgba(91,147,247,.18), transparent 65%), radial-gradient(420px 300px at 100% 100%, rgba(139,92,246,.14), transparent 65%);
    --tinta: #eef1fb; --tinta-2: #a9b4cf; --tinta-3: #7884a3;
    --verde: #4fd18b; --verde-f: rgba(79,209,139,.14); --laranja: #ffb066; --laranja-f: rgba(255,160,80,.15);
    --vermelho: #ff8a7a; --vermelho-f: rgba(255,110,90,.14); --amarelo: #f3d36b; --amarelo-f: rgba(243,211,107,.14);
    --superficie: #16213a; --cab: linear-gradient(135deg, rgba(31,58,120,.95), rgba(66,120,235,.78));
  }
  * { box-sizing: border-box; }
  .base { font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--tinta); -webkit-font-smoothing: antialiased; }
  button { font: inherit; cursor: pointer; border: 1px solid var(--borda-suave); background: var(--vidro-suave); color: var(--tinta); padding: 5px 11px; border-radius: 10px; transition: background .15s, border-color .15s, transform .15s; }
  button:hover:not(:disabled) { border-color: var(--acento); background: var(--vidro-forte); }
  button:disabled { opacity: .45; cursor: not-allowed; }
  button:focus-visible, input:focus-visible { outline: 2px solid var(--acento); outline-offset: 2px; }
  .primario { background: linear-gradient(135deg, var(--acento), var(--acento-2)); border-color: transparent; color: #fff; box-shadow: 0 6px 18px -8px var(--acento); }
  .primario:hover:not(:disabled) { background: linear-gradient(135deg, var(--acento), var(--acento-2)); filter: brightness(1.06); transform: translateY(-1px); }

  /* ---------- Botão flutuante (mesma linguagem do botão de feedback do CNABER) ---------- */
  .lancador { position: fixed; right: 22px; bottom: 22px; z-index: 2147483646; display: flex; gap: 8px; align-items: center;
    padding: 6px 18px 6px 6px; border-radius: 999px; border: none; font-weight: 600; font-size: 13px;
    color: var(--tinta); background: var(--superficie); box-shadow: 0 12px 28px -14px rgba(19,45,86,.45); isolation: isolate;
    --fab-c1: #2f6fed; --fab-c2: #5fd9b0; --fab-c3: #f0a94a; --fab-c4: #2f6fed; transition: transform .2s ease; }
  .lancador::before { content: ""; position: absolute; inset: 0; border-radius: 999px; padding: 2px;
    background: linear-gradient(135deg, var(--fab-c1), var(--fab-c2), var(--fab-c3), var(--fab-c4)); background-size: 300% 300%;
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask-composite: exclude;
    animation: fabGiro 6s linear infinite; z-index: -1; }
  .lancador::after { content: ""; position: absolute; inset: -8px; border-radius: 999px;
    background: linear-gradient(135deg, var(--fab-c1), var(--fab-c2), var(--fab-c3), var(--fab-c4)); background-size: 300% 300%;
    filter: blur(16px); opacity: .55; animation: fabGiro 6s linear infinite; z-index: -2; transition: opacity .3s ease, filter .3s ease; }
  @keyframes fabGiro { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
  .lancador.base:hover { transform: translateY(-2px); --fab-c1: #8b5cf6; --fab-c2: #2dd4bf; --fab-c3: #8b5cf6; --fab-c4: #2dd4bf; border: none; background: var(--superficie); }
  .lancador.base:hover::after { opacity: .85; filter: blur(20px); }
  .lancador .av { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }
  .lancador .qtd { background: var(--acento-suave); color: var(--acento); border-radius: 999px; padding: 0 8px; font-size: 11px; font-variant-numeric: tabular-nums; }

  .cab .av { width: 40px; height: 40px; border-radius: 13px; object-fit: cover; border: 1.5px solid rgba(255,255,255,.65); box-shadow: 0 4px 12px rgba(10,20,80,.25); }
  .breve { font-size: 9.5px; background: #f07d1e; color: #fff; border-radius: 999px; padding: 1px 7px; margin-left: 4px; vertical-align: 1px; font-weight: 700; text-shadow: none; }

  /* ---------- Painel em vidro ---------- */
  .painel { position: fixed; top: 12px; right: 12px; bottom: 12px; width: 410px; max-width: calc(100vw - 24px); z-index: 2147483646;
    background: var(--topo), var(--brilho), var(--cena), var(--vidro); -webkit-backdrop-filter: var(--desfoque); backdrop-filter: var(--desfoque);
    border: 1px solid var(--borda); border-radius: 22px; box-shadow: var(--sombra); display: flex; flex-direction: column; overflow: hidden;
    container-type: inline-size; container-name: painel;
    transform-origin: calc(100% - 40px) calc(100% - 20px); }
  .cab { background: transparent; color: #fff; padding: 12px 14px 6px; display: flex; align-items: center; gap: 10px; text-shadow: 0 1px 2px rgba(10,20,60,.25); }
  .cab b { font-size: 16px; font-weight: 700; white-space: nowrap; } .cab small { display: block; font-size: 11px; white-space: nowrap; color: rgba(255,255,255,.82); }
  .cab .sep { flex: 1; }
  .cab button { background: rgba(255,255,255,.14); color: #fff; border-color: rgba(255,255,255,.32); padding: 4px 9px; font-size: 12px; white-space: nowrap; border-radius: 999px; -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
  .cab button.ligado { background: rgba(255,255,255,.92); color: #1f3fae; border-color: #fff; font-weight: 600; text-shadow: none; }
  .cab button.ligado:hover:not(:disabled) { background: #fff; }
  .cab > div:first-of-type { min-width: 0; overflow: hidden; } .cab small { overflow: hidden; text-overflow: ellipsis; } .breve { white-space: nowrap; }
  .cab button:hover:not(:disabled) { background: rgba(255,255,255,.22); border-color: rgba(255,255,255,.55); }
  .corpo { overflow: auto; padding: 12px 12px 16px; display: flex; flex-direction: column; gap: 10px; }
  .corpo::-webkit-scrollbar { width: 8px; } .corpo::-webkit-scrollbar-thumb { background: var(--borda-suave); border-radius: 999px; }
  /* Expandido (no IXC) e em guia: blocos lado a lado; a análise ocupa a largura toda */
  .painel.expandido { width: min(1100px, calc(100vw - 24px)); }
  .painel.expandido .corpo, .painel.guia .corpo { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); align-content: start; align-items: start; }
  .painel.expandido .ia, .painel.guia .ia { grid-column: 1 / -1; }
  .painel.expandido .ia .cards, .painel.guia .ia .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 8px; }
  .painel.guia { position: static; inset: auto; width: auto; max-width: none; height: 100vh; border-radius: 0; border: 0; box-shadow: none; }
  .painel.guia .corpo { padding: 16px 20px 24px; gap: 12px; }
  .painel.guia { position: relative; }
  .cab .acoes-cab { display: flex; gap: 6px; }
  .desconectado { padding: 24px; }
  .bloco { background: var(--vidro-bloco); -webkit-backdrop-filter: blur(14px) saturate(170%); backdrop-filter: blur(14px) saturate(170%);
    border: 1px solid var(--borda-bloco); border-radius: 18px; padding: 12px; box-shadow: var(--realce), 0 6px 20px rgba(30,60,150,.10); }
  .bloco h4 { margin: 0 0 6px; font-size: 13px; color: var(--tinta); }
  .vivo { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--verde); }
  .vivo i { width: 8px; height: 8px; border-radius: 50%; background: var(--verde); animation: pulso 1.6s infinite; }
  @keyframes pulso { 50% { opacity: .3; } }
  .grade2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .num { font-variant-numeric: tabular-nums; }
  .kpi { background: var(--vidro-forte); border-radius: 12px; padding: 7px 9px; border: 1px solid var(--borda-bloco); box-shadow: var(--realce); }
  .kpi span { display: block; font-size: 11px; color: var(--tinta-3); } .kpi b { font-size: 15px; }
  .kpi.ok { background: var(--verde-f); } .kpi.nok { background: var(--laranja-f); }
  .conf { font-size: 12px; margin-top: 6px; display: flex; flex-direction: column; gap: 2px; }
  .ok-t { color: var(--verde); } .nok-t { color: var(--laranja); } .suave { color: var(--tinta-3); font-size: 12px; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .chip { background: var(--vidro-forte); border: 1px solid var(--borda-suave); border-radius: 999px; padding: 1px 8px; font-size: 11px; font-weight: 600; color: var(--tinta-2); }
  .chip.verde { background: var(--verde-f); color: var(--verde); } .chip.azul { background: var(--acento-suave); color: var(--acento); }
  .chip.laranja { background: var(--laranja-f); color: var(--laranja); } .chip.vermelho { background: var(--vermelho-f); color: var(--vermelho); } .chip.amarelo { background: var(--amarelo-f); color: var(--amarelo); }
  ul.sobras { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  ul.sobras li button { width: 100%; text-align: left; border: 0; background: transparent; padding: 5px 6px; display: grid; grid-template-columns: 70px 1fr auto; gap: 6px; border-radius: 8px; }
  ul.sobras li button:hover { background: var(--acento-suave); }
  ul.sobras .h { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tinta-3); }
  .resumo { background: var(--acento-suave); border-left: 3px solid var(--acento); padding: 8px 10px; border-radius: 8px; }
  .card { border: 1px solid var(--borda-bloco); border-radius: 14px; padding: 9px 11px; background: var(--vidro-forte); display: flex; flex-direction: column; gap: 6px; box-shadow: var(--realce), 0 2px 10px rgba(30,60,150,.06); }
  .card.aceita { border-color: var(--verde); background: var(--verde-f); } .card.rejeitada { opacity: .7; background: var(--vermelho-f); }
  .card p { margin: 0; } .card .acoes { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .card .acoes button { padding: 3px 8px; font-size: 12px; }
  .ok-b { border-color: var(--verde); color: var(--verde); } .nok-b { border-color: var(--vermelho); color: var(--vermelho); }
  code { font: 11px ui-monospace, Menlo, Consolas, monospace; background: var(--vidro-forte); color: var(--tinta-2); padding: 1px 5px; border-radius: 6px; }
  .alerta { padding: 8px 10px; border-radius: 10px; background: var(--vermelho-f); color: var(--vermelho); }
  .aviso { padding: 8px 10px; border-radius: 10px; background: var(--amarelo-f); color: var(--amarelo); }
  .msgs { display: flex; flex-direction: column; gap: 4px; max-height: 200px; overflow: auto; margin-bottom: 6px; }
  .msg { padding: 6px 9px; border-radius: 12px; white-space: pre-wrap; max-width: 90%; }
  .msg.usuario { align-self: flex-end; background: var(--acento-suave); } .msg.lolla { background: var(--vidro-forte); } .msg.erro { background: var(--vermelho-f); color: var(--vermelho); }
  form.chat { display: flex; gap: 6px; }
  form.chat input { flex: 1; font: inherit; padding: 6px 10px; border: 1px solid var(--borda-suave); border-radius: 10px; background: var(--vidro-forte); color: var(--tinta); }
  .giro { width: 14px; height: 14px; border: 2px solid var(--borda-suave); border-top-color: var(--acento); border-radius: 50%; animation: g .8s linear infinite; display: inline-block; vertical-align: -2px; margin-right: 6px; }
  @keyframes g { to { transform: rotate(360deg); } }
  .toast { position: absolute; left: 50%; transform: translateX(-50%); bottom: 16px; max-width: calc(100% - 32px); background: var(--verde); color: #fff; padding: 8px 12px; border-radius: 12px; z-index: 2147483647; box-shadow: 0 8px 24px rgba(0,0,0,.2); }
  .toast.erro { background: var(--vermelho); }

  /* ---------- Responsividade (pela largura do próprio painel) ---------- */
  .painel { transition: border-radius .3s; }
  .painel.expandido { box-shadow: var(--sombra), 0 0 0 2px rgba(91,147,247,.35); }
  @container painel (max-width: 480px) { .cab .breve { display: none; } }
  @container painel (max-width: 370px) { .cab .rot { display: none; } }
  @container painel (max-width: 330px) { .grade2 { grid-template-columns: 1fr; } }
  @container painel (min-width: 720px) {
    .painel.expandido .corpo > .bloco:first-child, .painel.guia .corpo > .bloco:first-child { grid-column: span 2; }
    .painel.expandido .corpo > .bloco:first-child .grade2, .painel.guia .corpo > .bloco:first-child .grade2 { grid-template-columns: repeat(4, 1fr); }
  }
  @media (max-width: 560px) {
    .painel { top: 8px; right: 8px; bottom: 8px; max-width: calc(100vw - 16px); }
    .painel.expandido { width: calc(100vw - 16px); }
  }

  /* ---------- Gotinhas ao minimizar ---------- */
  .gotas { position: fixed; width: 0; height: 0; z-index: 2147483647; pointer-events: none; }
  .gotas span { position: absolute; left: 0; top: 0; border-radius: 50%; will-change: transform, opacity;
    background: radial-gradient(circle at 35% 30%, rgba(255,255,255,.95), rgba(255,255,255,0) 45%), var(--c, #2f6fed);
    box-shadow: 0 0 6px var(--c, #2f6fed); }

  @media (prefers-reduced-motion: reduce) {
    .vivo i, .lancador::before, .lancador::after { animation: none; }
  }
  `;

  const tomTipo = { identificador: 'verde', 'valor + data': 'verde', lote: 'azul' };
  const tomCerteza = { alta: 'verde', media: 'amarelo', baixa: 'laranja' };

  function lancador(s) {
    const n = s.ind ? s.ind.sobrasIxc + s.ind.sobrasBanco : null;
    return `<button class="lancador base" data-a="abrir" title="Abrir a Lolla${n != null ? ` (${n} sobra(s))` : ''}">${avatar('av')}Lolla${n ? ` <span class="qtd">${n}</span>` : ''}</button>`;
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
        <div class="cards">${r.itens.map((it, k) => {
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
        }).join('')}</div>
        <div><button data-a="copiar">Copiar resumo para o atendimento</button>
          ${a.usage ? `<span class="suave"> ${a.usage.input_tokens} + ${a.usage.output_tokens} tokens</span>` : ''}</div>
        <div><div class="msgs">${s.chat.map((m) => `<div class="msg ${m.papel}">${esc(m.texto)}</div>`).join('')}${s.conversando ? '<div class="msg lolla">…</div>' : ''}</div>
          <form class="chat" data-f="chat"><input id="lolla-chat" autocomplete="off" placeholder="Pergunte sobre esta análise…" ${s.conversando ? 'disabled' : ''}><button class="primario" ${s.conversando ? 'disabled' : ''}>Enviar</button></form></div>`;
    }
    const nada = s.ind && !s.ind.sobrasIxc && !s.ind.sobrasBanco && !(s.pareamento.duplicados || []).length && !s.ind.ambiguos;
    return `<div class="bloco ia"><h4>Análise da Lolla</h4><p class="suave">${rotulo} · só valor, data, documento, IDs e histórico mascarado vão para a IA.</p>
      <p><button class="primario" data-a="analisar" ${s.analisando || nada || !s.ind ? 'disabled' : ''}>${nada ? 'Nada para analisar: tudo pareado' : s.analise ? 'Analisar de novo' : 'Analisar sobras com IA'}</button></p>
      ${corpo}</div>`;
  }

  function painel(s, o) {
    o = o || {};
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
    return `<div class="painel base ${o.modo === 'guia' ? 'guia' : (o.expandido ? 'expandido' : '')}" role="dialog" aria-label="AR Lolla">
      <div class="cab">${avatar('av')}<div><b>AR Lolla</b><small>Conciliação com IA <span class="breve" title="A aparência da Lolla ainda vai ser definida">visual em breve</span></small></div><span class="sep"></span>
        <div class="acoes-cab">${o.modo === 'guia'
          ? '<button data-a="ir-ixc" title="Voltar para a aba do IXC">↩ Ir para o IXC</button>'
          : `<button data-a="expandir" class="${o.expandido ? 'ligado' : ''}" aria-pressed="${o.expandido ? 'true' : 'false'}" title="${o.expandido ? 'Voltar ao painel estreito' : 'Deixar o painel largo, com os blocos lado a lado'}">${o.expandido ? '⤡<span class="rot"> Recolher</span>' : '⤢<span class="rot"> Expandir</span>'}</button>
             <button data-a="abrir-guia" title="Abrir a Lolla numa guia própria">↗<span class="rot"> Guia</span></button>
             <button data-a="minimizar" title="Minimizar">–</button>`}</div></div>
      <div class="corpo">${corpo}</div>
      ${s.aviso ? `<div class="toast ${s.aviso.tipo}">${esc(s.aviso.texto)}</div>` : ''}</div>`;
  }

  return { CSS, lancador, painel };
})();

/*
 * Modo Análise — etapa 5: interpretação das divergências pela IA (opcional, com consentimento).
 * Fluxo: verificar intermediário -> preparar (mascarar + conferir) -> mostrar exatamente o que vai -> estimar custo
 *        -> o analista confirma -> enviar parte a parte -> validar a resposta -> mostrar custo real.
 * Sem intermediário disponível, a etapa fica bloqueada com o motivo. Nenhuma resposta é simulada.
 */
(function (g) {
  const L = g.Lolla;
  const UI = L.ui.analise;
  const A = L.domain.analise;
  const S = () => L.services.iaIntermediario;
  const c = UI.c;
  const { esc } = c;

  async function verificar() {
    const ia = UI.estado.ia;
    ia.verificando = true; ia.erroStatus = ''; UI.renderParte('ia');
    try {
      ia.status = await S().status();
      const habilitados = ia.status.modelos.filter((m) => m.habilitado);
      if (!habilitados.some((m) => m.id === ia.modelo)) ia.modelo = (habilitados.find((m) => m.padrao) || habilitados[0] || {}).id;
    } catch (err) {
      ia.status = null; ia.erroStatus = err.message;
    }
    ia.verificando = false; UI.renderParte('ia');
  }

  function preparar() {
    const e = UI.estado, ia = e.ia;
    const p = A.privacidadeIa.montarPayload(e.analise, { maxItensPorParte: 40 });
    p.verificacao = A.privacidadeIa.verificarPayload(p.partes, e.analise);
    ia.preparo = p; ia.consentimento = false; ia.problemas = [];
    UI.renderParte('ia');
  }

  function bloqueio() {
    const ia = UI.estado.ia, st = ia.status, p = ia.preparo;
    if (!st) return 'Intermediário da IA não conectado.';
    if (!st.disponivel) return st.motivo || 'IA indisponível no intermediário.';
    if (!p) return 'Prepare o envio para ver os dados e o custo.';
    if (!p.totalItens) return 'Não há divergências que precisem de interpretação: tudo foi explicado pelas regras do código.';
    if (!p.verificacao.ok) return 'Envio bloqueado pela conferência de privacidade.';
    const est = S().estimar(st, ia.modelo, p.partes);
    if (!est) return 'Escolha um modelo.';
    if (est.custoMaximo > st.limites.saldoHoje) return `O custo máximo estimado (${c.brl(est.custoMaximo)}) passa do saldo do dia (${c.brl(st.limites.saldoHoje)}).`;
    if (est.custoMaximo > st.limites.porAnalise) return `O custo máximo estimado (${c.brl(est.custoMaximo)}) passa do limite por análise (${c.brl(st.limites.porAnalise, 2)}). Use o Haiku ou interprete menos itens.`;
    if (!ia.consentimento) return 'Marque a confirmação para liberar o envio.';
    return '';
  }

  async function enviar() {
    const e = UI.estado, ia = e.ia;
    const motivo = bloqueio();
    if (motivo) { UI.avisar('erro', motivo); return; }
    ia.enviando = true; ia.problemas = []; ia.observacoes = [];
    const partes = ia.preparo.partes;
    for (let k = 0; k < partes.length; k++) {
      ia.progresso = `Enviando parte ${k + 1} de ${partes.length}…`; UI.renderParte('ia');
      try {
        const r = await S().interpretar(ia.modelo, e.analise.id, partes[k]);
        const v = A.privacidadeIa.validarResposta(r.resultado, partes[k]);
        v.itens.forEach((x) => { ia.resultados[x.id] = x; });
        ia.problemas.push(...v.problemas);
        if (v.observacoes) ia.observacoes.push(v.observacoes);
        ia.custos.push({ parte: k + 1, modelo: r.modelo, tokensEntrada: r.usage.tokensEntrada, tokensSaida: r.usage.tokensSaida, custo: r.custoReais, estimativa: r.estimativaReais });
        if (r.truncado) ia.problemas.push(`Parte ${k + 1}: a resposta foi cortada pelo limite de tokens; itens sem resposta ficaram sem interpretação.`);
        ia.status.limites.gastoHoje = r.gastoHoje; ia.status.limites.saldoHoje = r.saldoHoje;
      } catch (err) {
        ia.problemas.push(`Parte ${k + 1}: ${err.message}`);
        if (err.corpo && err.corpo.custoReais) ia.custos.push({ parte: k + 1, modelo: ia.modelo, tokensEntrada: err.corpo.usage.tokensEntrada, tokensSaida: err.corpo.usage.tokensSaida, custo: err.corpo.custoReais });
        if (['limite_analise', 'limite_dia', 'payload', 'offline', 'indisponivel'].includes(err.codigo)) break;   // não adianta seguir
      }
    }
    ia.enviando = false; ia.progresso = ''; ia.consentimento = false;
    UI.render();
    UI.avisar(ia.problemas.length ? 'erro' : 'ok', ia.problemas.length ? 'IA respondeu com observações — veja a etapa 5.' : 'Interpretação recebida. Veja os itens marcados com ✦ IA.');
  }

  function tela() {
    const e = UI.estado, ia = e.ia, st = ia.status;
    const conexao = ia.verificando ? c.spinner('Verificando o intermediário…')
      : st ? (st.disponivel ? c.selo('Intermediário conectado', 'verde') : c.selo('IA indisponível', 'vermelho')) : c.selo('Intermediário não conectado', 'vermelho');
    if (!e.analise) return `<header><h2><span class="passo">5</span>Interpretação pela IA <span class="selo">opcional</span></h2><span class="sep"></span>${conexao}</header>
      <p class="lead">Depois do cruzamento, a IA pode sugerir a causa das divergências que o código não explicou.</p>
      ${ia.erroStatus ? c.alerta('aviso', esc(ia.erroStatus)) : st && !st.disponivel ? c.alerta('aviso', esc(st.motivo)) : ''}`;
    const p = ia.preparo;
    const est = st && p && p.totalItens ? S().estimar(st, ia.modelo, p.partes) : null;
    const motivo = bloqueio();
    const gastoReal = ia.custos.reduce((a, x) => a + x.custo, 0);
    const respondidos = Object.keys(ia.resultados).length;
    return `<header><h2><span class="passo ${respondidos ? 'ok' : ''}">5</span>Interpretação pela IA <span class="selo">opcional</span></h2><span class="sep"></span>${conexao}</header>
      <p class="lead">A IA não decide o que corresponde a quê: ela só sugere a causa provável das ${e.analise.resumo.precisamIa} divergência(s) que o código não explicou. Nada é enviado sem a sua confirmação.</p>
      ${ia.erroStatus ? c.alerta('erro', esc(ia.erroStatus)) : ''}
      ${st && !st.disponivel ? c.alerta('aviso', esc(st.motivo)) : ''}
      <div class="linha-form">
        <label class="campo">Endereço do intermediário<input type="url" id="ia-url" value="${esc(S().endereco())}" style="width:240px"></label>
        <button class="btn" data-acao="ia-verificar">Verificar conexão</button>
        ${st ? `<label class="campo">Modelo<select data-acao="ia-modelo">${st.modelos.map((m) => `<option value="${esc(m.id)}" ${m.id === ia.modelo ? 'selected' : ''} ${m.habilitado ? '' : 'disabled'}>${esc(m.nome)}${m.padrao ? ' (padrão)' : ''}${m.habilitado ? '' : ' — ' + esc(m.observacao || 'desabilitado')}</option>`).join('')}</select></label>` : ''}
        <button class="btn" data-acao="ia-preparar" ${ia.enviando ? 'disabled' : ''}>${p ? 'Preparar de novo' : 'Preparar envio'}</button>
      </div>
      ${p ? `<div class="ia-grade" style="margin-top:12px">
        <div>
          <h3 style="font-size:14px;margin:0 0 6px">O que será enviado</h3>
          ${p.totalItens ? `<p class="nota" style="margin:0 0 6px">${p.totalItens} divergência(s), ${p.totalLinhas} linha(s), em ${p.partes.length} parte(s). Só valores, datas, IDs técnicos e descrição do extrato mascarada. Nome, CPF/CNPJ, conta e linhas originais ficam no navegador.</p>
            ${p.verificacao.ok ? c.alerta('ok', 'Conferência de privacidade: nenhum CPF/CNPJ, e-mail, telefone ou nome de cliente encontrado.') : c.alerta('erro', '<b>Envio bloqueado:</b>' + c.lista(p.verificacao.problemas))}
            <details><summary class="nota">Ver exatamente o conteúdo (JSON)</summary><pre class="previa">${esc(JSON.stringify(p.partes, null, 1))}</pre></details>`
            : c.alerta('ok', 'Nenhuma divergência precisa de interpretação.')}
        </div>
        <div>
          <h3 style="font-size:14px;margin:0 0 6px">Custo</h3>
          ${st ? `<dl class="custos">
            ${est ? `<dt>Tokens estimados</dt><dd>${est.entrada.toLocaleString('pt-BR')} de entrada · ~${est.saidaProvavel.toLocaleString('pt-BR')} de saída (máx. ${est.saidaMaxima.toLocaleString('pt-BR')})</dd>
            <dt>Custo estimado</dt><dd>~${c.brl(est.custoProvavel)} (máximo ${c.brl(est.custoMaximo)})</dd>` : ''}
            <dt>Limite por análise</dt><dd>${c.brl(st.limites.porAnalise, 2)}</dd>
            <dt>Disponível hoje</dt><dd>${c.brl(st.limites.saldoHoje)} de ${c.brl(st.limites.porDia, 2)}</dd>
            ${ia.custos.length ? `<dt>Custo real</dt><dd><b>${c.brl(gastoReal, 6)}</b> (${ia.custos.map((x) => `parte ${x.parte}: ${x.tokensEntrada}+${x.tokensSaida} tokens`).join('; ')})</dd>` : ''}
          </dl>` : '<p class="nota">Conecte o intermediário para ver estimativa e limites.</p>'}
        </div>
      </div>
      ${p.totalItens ? `<label class="consentimento"><input type="checkbox" data-acao="ia-consentimento" ${ia.consentimento ? 'checked' : ''} ${p.verificacao.ok ? '' : 'disabled'}>
        <span>Revisei o conteúdo acima e autorizo o envio destas ${p.totalItens} divergência(s) mascaradas para a IA (${esc((st && (st.modelos.find((m) => m.id === ia.modelo) || {}).nome) || ia.modelo || '')}).</span></label>
      <div class="linha-form"><button class="btn primario" data-acao="ia-enviar" ${motivo || ia.enviando ? 'disabled' : ''}>${ia.enviando ? esc(ia.progresso || 'Enviando…') : 'Enviar para a IA'}</button>
        ${motivo && !ia.enviando ? `<span class="nota">${esc(motivo)}</span>` : ''}</div>` : ''}` : ''}
      ${ia.problemas.length ? c.alerta('aviso', '<b>Observações sobre a resposta</b>' + c.lista(ia.problemas)) : ''}
      ${(ia.observacoes || []).length ? c.alerta('info', '<b>Padrões apontados pela IA:</b> ' + esc(ia.observacoes.join(' '))) : ''}
      ${respondidos ? `<p class="nota">${respondidos} item(ns) com interpretação. Eles aparecem com ✦ IA no resultado e entram no texto do chamado e no CSV.</p>` : ''}`;
  }

  function aoMudar(el) {
    const ia = UI.estado.ia;
    if (el.dataset.acao === 'ia-modelo') { ia.modelo = el.value; ia.consentimento = false; UI.renderParte('ia'); return true; }
    if (el.dataset.acao === 'ia-consentimento') { ia.consentimento = el.checked; UI.renderParte('ia'); return true; }
    if (el.id === 'ia-url') {
      try { S().definirEndereco(el.value); verificar(); } catch (err) { UI.avisar('erro', err.message); }
      return true;
    }
    return false;
  }

  UI.ia = { verificar, preparar, enviar, tela, aoMudar };
})(typeof self !== 'undefined' ? self : globalThis);

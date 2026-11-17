/*
 * Tela Contexto da IA: lista, visualização (texto completo, com quebras de linha),
 * criação, edição e exclusão. A lista é a mesma que a extensão Lolla usa.
 */
Lolla.ui.views.contexto = (function () {
  const { esc, dataHora } = Lolla.core.fmt;
  const c = Lolla.ui.c;
  const num = (n) => n.toLocaleString('pt-BR');
  const tokens = (chars) => Math.ceil(chars / 4); // estimativa: ~4 caracteres por token em português

  // Rascunho do formulário fora do store: a tela pode ser redesenhada sem perder o que foi digitado
  const rascunho = { titulo: '', texto: '' };
  function prepararRascunho(item) { rascunho.titulo = item ? item.titulo : ''; rascunho.texto = item ? item.texto : ''; }

  function contador(s) {
    const x = s.ctx, item = x.lista && x.lista.find((i) => i.id === x.aberto);
    const outros = x.total - (x.modo === 'editar' && item ? item.texto.length : 0);
    const n = rascunho.texto.length, passa = outros + n > x.limites.maxTotal;
    return { texto: `${num(n)} de ${num(x.limites.maxTexto)} caracteres (~${num(tokens(n))} tokens). Total com os outros: ${num(outros + n)} de ${num(x.limites.maxTotal)}.`, passa };
  }

  function lista(s) {
    const x = s.ctx, q = x.busca.trim().toLowerCase();
    if (!x.lista.length) return c.vazio('Nenhum contexto ainda. Clique em + Novo contexto.');
    const itens = x.lista.filter((i) => !q || (i.titulo + ' ' + i.texto).toLowerCase().includes(q));
    if (!itens.length) return c.vazio('Nada encontrado com essa busca.');
    return `<ul class="ctx-itens">${itens.map((i) => `<li><button data-acao="ctx-abrir" data-id="${i.id}" class="ctx-item ${i.id === x.aberto && x.modo !== 'novo' ? 'ativo' : ''}">
      <b>${esc(i.titulo)}</b><span class="trecho">${esc(i.texto.replace(/\s+/g, ' ').slice(0, 140))}</span>
      <small>${num(i.texto.length)} caracteres · ${dataHora(i.atualizado_em)}</small></button></li>`).join('')}</ul>`;
  }

  function detalhe(s) {
    const x = s.ctx, item = x.lista.find((i) => i.id === x.aberto);
    if (x.modo === 'novo' || (x.modo === 'editar' && item)) {
      const cont = contador(s);
      return `<form data-form="ctx" class="ctx-form" novalidate>
        <h3>${x.modo === 'novo' ? 'Novo contexto' : 'Editar contexto'}</h3>
        ${x.erroForm ? `<div class="alerta erro">${esc(x.erroForm)}</div>` : ''}
        <label><span>Título <span class="obrig">*</span></span><input id="ctx-titulo" maxlength="${x.limites.maxTitulo}" value="${esc(rascunho.titulo)}" placeholder="Ex.: Sicredi — crédito de cobrança em lote"></label>
        <label><span>Texto <span class="obrig">*</span></span><textarea id="ctx-texto" maxlength="${x.limites.maxTexto}" rows="14"
          placeholder="Ex.: No Sicredi, a liquidação de boletos vem num único crédito por dia (LIQ.COBRANCA), que corresponde à soma das baixas do Gateway no IXC.">${esc(rascunho.texto)}</textarea></label>
        <small id="ctx-contador" class="${cont.passa ? 'erro-txt' : ''}">${esc(cont.texto)}</small>
        <div class="botoes"><span class="sep"></span><button type="button" data-acao="ctx-cancelar">Cancelar</button>
          <button class="primario" ${x.salvando ? 'disabled' : ''}>${x.salvando ? 'Salvando…' : 'Salvar'}</button></div>
      </form>`;
    }
    if (!item) return c.vazio(x.lista.length ? 'Escolha um contexto na lista para ver o texto completo.' : 'Os contextos que você salvar aparecem aqui.');
    return `<div class="ctx-cab"><h3>${esc(item.titulo)}</h3>
        <div><button data-acao="ctx-editar">Editar</button> <button data-acao="ctx-apagar" class="nok">Apagar</button></div></div>
      <div class="ctx-ver">${esc(item.texto)}</div>
      <p class="nota">${num(item.texto.length)} caracteres (~${num(tokens(item.texto.length))} tokens) · criado em ${dataHora(item.criado_em)}${item.atualizado_em !== item.criado_em ? ` · editado em ${dataHora(item.atualizado_em)}` : ''}</p>`;
  }

  function render(s) {
    const x = s.ctx;
    const titulo = '<h2>Contexto da IA</h2>';
    if (!Lolla.services.contexto.disponivel()) {
      return titulo + `<div class="alerta erro">O Contexto da IA fica no servidor local da Lolla, o mesmo que a extensão usa.
        Na pasta do projeto rode <code>npm run contexto</code> e abra <b>http://127.0.0.1:3100</b>.</div>`;
    }
    if (x.erro) return titulo + `<div class="alerta erro">${esc(x.erro)} <button data-acao="ctx-recarregar">Tentar novamente</button></div>`;
    if (!x.lista) return titulo + c.spinner('Carregando os contextos…');
    return `<div class="ctx-topo">${titulo}
        <span class="nota">${x.lista.length} de ${x.limites.maxContextos} contextos · ${num(x.total)} de ${num(x.limites.maxTotal)} caracteres (~${num(tokens(x.total))} tokens por análise)</span></div>
      <div class="alerta aviso"><b>Este texto vai para a IA.</b> Não escreva nomes de clientes, CPF, CNPJ, e-mail ou outros dados pessoais.
        Use para regras de um banco, padrões de histórico do provedor e casos já resolvidos. A mesma lista vale aqui e na extensão Lolla, e vai junto com as sobras em toda análise.</div>
      <div class="ctx">
        <section class="bloco ctx-lista">
          <div class="ctx-barra"><button data-acao="ctx-novo" class="primario" ${x.lista.length >= x.limites.maxContextos ? 'disabled' : ''}>+ Novo contexto</button>
            <input id="ctx-busca" type="search" placeholder="Buscar" value="${esc(x.busca)}" aria-label="Buscar nos contextos"></div>
          ${lista(s)}
        </section>
        <section class="bloco ctx-detalhe">${detalhe(s)}</section>
      </div>`;
  }

  return { render, rascunho, prepararRascunho, contador };
})();

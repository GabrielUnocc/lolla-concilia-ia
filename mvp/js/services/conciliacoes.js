/*
 * Registro de conciliações: cada uma tem conta, período (um dia ou vários),
 * OFX importado (opcional), francesinha (opcional) e observação.
 * A situação é calculada pelas linhas do IXC no período:
 *   aberta       = nenhuma linha conciliada ainda
 *   em andamento = parte conciliada, ainda com pendência
 *   fechada      = tudo conciliado (diferença zero)
 */
Lolla.services.conciliacoes = (function () {
  const seguro = Lolla.services.armazenamento.seguro;
  const arquivos = Lolla.services.armazenamento.arquivos;
  const CHAVE = 'conciliacoes';
  const idFrancesinha = (id) => 'francesinha:' + id;

  const listar = async () => (await seguro.ler(CHAVE)) || [];
  const gravar = (lista) => seguro.gravar(CHAVE, lista);

  async function criar(dados, francesinha) {
    const lista = await listar();
    const id = Math.max(0, ...lista.map((c) => c.id)) + 1;
    const reg = Object.assign({ id, criadaEm: Date.now() }, dados, {
      francesinha: francesinha ? { nome: francesinha.nome, tipo: francesinha.tipo, tamanho: francesinha.tamanho } : null
    });
    if (francesinha) await arquivos.gravar(idFrancesinha(id), { nome: francesinha.nome, tipo: francesinha.tipo, base64: francesinha.base64 });
    lista.push(reg);
    await gravar(lista);
    return reg;
  }

  async function remover(id) {
    await gravar((await listar()).filter((c) => c.id !== id));
    try { await arquivos.remover(idFrancesinha(id)); } catch (e) { /* sem arquivo */ }
  }

  const lerFrancesinha = (id) => arquivos.ler(idFrancesinha(id));

  // Situação a partir das linhas do período (mesmo formato de Lolla.services.ixc.buscarTela)
  function situacao({ movimentacao, extrato }) {
    const linhas = movimentacao.concat(extrato);
    const conciliadas = linhas.filter((l) => l.conciliado).length;
    const pend = (arr) => arr.filter((l) => !l.conciliado);
    const soma = (arr) => pend(arr).reduce((s, l) => s + l.valor, 0);
    const pendentes = linhas.length - conciliadas;
    const estado = linhas.length && !pendentes ? 'fechada' : conciliadas ? 'andamento' : 'aberta';
    return { estado, total: linhas.length, conciliadas, pendentesIxc: pend(movimentacao).length, pendentesBanco: pend(extrato).length,
      diferenca: soma(movimentacao) - soma(extrato) };
  }

  const ROTULOS = { aberta: 'Aberta', andamento: 'Em andamento', fechada: 'Fechada' };

  return { listar, criar, remover, lerFrancesinha, situacao, ROTULOS };
})();

/*
 * Cliente IXC SIMULADO.
 * Se comporta como uma API: latência, falhas aleatórias e respostas no formato da tela
 * de Conciliação Manual (campos fn_movim_finan.* / fn_extrato.*, valores e datas em pt-BR).
 *
 * Contrato (o futuro cliente real deve expor as mesmas funções):
 *   listarContas() -> [{ id, descricao, banco }]
 *   listarMovimentacao({ contaId, dataIni, dataFim }) -> linhas fn_movim_finan
 *   listarExtrato({ contaId, dataIni, dataFim })      -> linhas fn_extrato
 *   conciliar({ movIds, extIds }) / desconciliar({ movIds, extIds })
 *   lancarRecebimento({ extId })  -> baixa manual a partir de uma linha do extrato
 *   estornarBaixa({ movId })
 */
Lolla.services.ixcSimulado = (function () {
  const cfg = () => Lolla.core.config.get().ixc;
  const fmt = Lolla.core.fmt;
  const seguro = Lolla.services.armazenamento.seguro;
  const CHAVE = 'base_ixc_simulada';
  let db = null;

  class ErroIxc extends Error {
    constructor(status, msg) { super(msg); this.status = status; }
  }

  async function carregar() {
    if (db) return db;
    db = await seguro.ler(CHAVE);
    if (!db) { db = Lolla.services.baseSimulada.gerar(); await salvar(); }
    return db;
  }
  const salvar = () => seguro.gravar(CHAVE, db);

  // Simula rede: espera e, às vezes, falha
  async function rede(nome) {
    const { latenciaMinMs, latenciaMaxMs, taxaErro } = cfg();
    const ms = latenciaMinMs + Math.random() * Math.max(0, latenciaMaxMs - latenciaMinMs);
    await new Promise((ok) => setTimeout(ok, ms));
    if (Math.random() < taxaErro) {
      const falhas = [
        [503, 'IXC indisponível no momento (simulado). Tente novamente.'],
        [504, 'Tempo de resposta do IXC esgotado (simulado).'],
        [500, 'Erro interno ao consultar ' + nome + ' (simulado).']
      ];
      const [st, msg] = falhas[Math.floor(Math.random() * falhas.length)];
      throw new ErroIxc(st, msg);
    }
  }

  // Formato "como vem da tela" (strings em pt-BR, conciliado S/N)
  const paraIxc = (l, extra) => Object.assign({
    id: String(l.id),
    conciliado: l.conciliado ? 'S' : 'N',
    data: fmt.brDeIso(l.data),
    documento: l.documento || '',
    tx_id: l.tx_id || '',
    credito: fmt.moeda(l.credito),
    debito: fmt.moeda(l.debito),
    historico: l.historico || ''
  }, extra || {});

  const noPeriodo = (l, f) => l.conta_id === Number(f.contaId) && l.data >= f.dataIni && l.data <= f.dataFim;

  function validarFiltro(f) {
    if (!f || !f.contaId) throw new ErroIxc(400, 'Informe a conta.');
    if (!f.dataIni || !f.dataFim || f.dataIni > f.dataFim) throw new ErroIxc(400, 'Período inválido.');
  }

  return {
    async listarContas() {
      await carregar(); await rede('contas');
      return db.contas.map((c) => Object.assign({}, c));
    },

    async listarMovimentacao(f) {
      validarFiltro(f); await carregar(); await rede('movimentação financeira');
      return db.movimentacao.filter((l) => !l.estornado && noPeriodo(l, f))
        .map((l) => paraIxc(l, { origem: l.origem, cliente: l.cliente }));
    },

    async listarExtrato(f) {
      validarFiltro(f); await carregar(); await rede('extrato OFX');
      return db.extrato.filter((l) => noPeriodo(l, f)).map((l) => paraIxc(l));
    },

    async conciliar({ movIds, extIds }) {
      await carregar(); await rede('conciliação');
      const mov = db.movimentacao.filter((l) => movIds.includes(String(l.id)));
      const ext = db.extrato.filter((l) => extIds.includes(String(l.id)));
      if (!mov.length && !ext.length) throw new ErroIxc(400, 'Nenhuma linha selecionada.');
      const soma = (arr) => arr.reduce((a, l) => a + l.credito - l.debito, 0);
      if (soma(mov) !== soma(ext)) throw new ErroIxc(422, 'Os totais selecionados não batem. Diferença: ' + fmt.reais(soma(mov) - soma(ext)));
      mov.concat(ext).forEach((l) => { l.conciliado = true; });
      await salvar();
      return { conciliados: mov.length + ext.length };
    },

    async desconciliar({ movIds, extIds }) {
      await carregar(); await rede('conciliação');
      db.movimentacao.concat(db.extrato)
        .filter((l) => movIds.concat(extIds).includes(String(l.id)))
        .forEach((l) => { l.conciliado = false; });
      await salvar();
      return { ok: true };
    },

    async lancarRecebimento({ extId }) {
      await carregar(); await rede('lançamento');
      const e = db.extrato.find((l) => String(l.id) === String(extId));
      if (!e) throw new ErroIxc(404, 'Linha do extrato não encontrada.');
      const m = {
        id: ++db.proximoId.mov, conta_id: e.conta_id, conciliado: false, data: e.data,
        documento: e.documento, tx_id: e.tx_id, credito: e.credito, debito: e.debito,
        historico: (e.debito ? 'Lançamento manual - ' : 'Recebimento manual - ') + 'criado pela Lolla (simulado)',
        cliente: '', origem: 'manual'
      };
      db.movimentacao.push(m);
      await salvar();
      return { id: String(m.id) };
    },

    async estornarBaixa({ movId }) {
      await carregar(); await rede('estorno');
      const m = db.movimentacao.find((l) => String(l.id) === String(movId));
      if (!m) throw new ErroIxc(404, 'Lançamento não encontrado.');
      if (m.conciliado) throw new ErroIxc(409, 'Desfaça a conciliação antes de estornar.');
      m.estornado = true;
      await salvar();
      return { ok: true };
    },

    async restaurarBase() {
      db = Lolla.services.baseSimulada.gerar();
      await salvar();
    },

    ErroIxc
  };
})();

/*
 * Ponto único de acesso ao IXC usado pelo resto da aplicação.
 * Normaliza o formato da tela (strings pt-BR) para o modelo interno
 * (datas ISO, valores em centavos). Para usar o IXC real, basta criar um
 * cliente com o mesmo contrato e escolher aqui pelo config.ixc.modo.
 */
Lolla.services.ixc = (function () {
  const fmt = Lolla.core.fmt;
  const cliente = () => {
    const modo = Lolla.core.config.get().ixc.modo;
    if (modo === 'simulado') return Lolla.services.ixcSimulado;
    throw new Error('Modo IXC "' + modo + '" ainda não implementado.');
  };

  const normalizar = (lado) => (l) => {
    const credito = fmt.centavosBR(l.credito), debito = fmt.centavosBR(l.debito);
    return {
      lado, id: String(l.id), conciliado: l.conciliado === 'S',
      data: fmt.isoDeBR(l.data), documento: l.documento, tx_id: l.tx_id,
      credito, debito, valor: credito - debito, historico: l.historico,
      origem: l.origem || '', cliente: l.cliente || ''
    };
  };

  return {
    listarContas: () => cliente().listarContas(),
    async buscarTela(filtro) {
      const [mov, ext] = await Promise.all([cliente().listarMovimentacao(filtro), cliente().listarExtrato(filtro)]);
      return { movimentacao: mov.map(normalizar('ixc')), extrato: ext.map(normalizar('banco')) };
    },
    conciliar: (a) => cliente().conciliar(a),
    desconciliar: (a) => cliente().desconciliar(a),
    lancarRecebimento: (a) => cliente().lancarRecebimento(a),
    estornarBaixa: (a) => cliente().estornarBaixa(a),
    restaurarBase: () => cliente().restaurarBase()
  };
})();

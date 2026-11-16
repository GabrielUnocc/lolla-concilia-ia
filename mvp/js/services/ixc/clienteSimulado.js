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
    if (!db) { db = Object.assign(Lolla.services.cenarios.padrao.gerar(), { cenario: 'padrao' }); await salvar(); }
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

    /*
     * Importa um OFX (já lido por Lolla.domain.ofx) como uma conta nova na base simulada.
     * modo: 'divergencias' (espelho do OFX com erros plantados), 'exato' (espelho fiel) ou 'vazio' (sem IXC).
     * Devolve o gabarito do que foi plantado, para conferir a análise da Lolla.
     */
    async importarOfx({ ofx, modo }) {
      await carregar(); await rede('importação do OFX');
      const contaId = Math.max(0, ...db.contas.map((c) => c.id)) + 1;
      const fim = (ofx.conta.numero || '').slice(-6);
      db.contas.push({ id: contaId, banco: ofx.conta.banco, importada: true,
        descricao: `${ofx.conta.banco} — conta ${fim ? '…' + fim : 's/n'} (OFX ${ofx.arquivo || 'importado'})` });

      const novosExt = ofx.linhas.map((l) => ({
        id: ++db.proximoId.ext, conta_id: contaId, conciliado: false, data: l.data,
        documento: l.documento || '', tx_id: '', fitid: l.fitid,
        credito: l.valor > 0 ? l.valor : 0, debito: l.valor < 0 ? -l.valor : 0, historico: l.historico || l.tipo
      }));
      db.extrato.push(...novosExt);

      const gabarito = [];
      if (modo !== 'vazio') {
        let seq = 0;
        const vistos = new Set(); // linha repetida no OFX não vira baixa repetida no IXC
        const espelho = novosExt.filter((e) => !e.fitid || (vistos.has(e.fitid) ? false : vistos.add(e.fitid))).map((e) => ({
          id: ++db.proximoId.mov, conta_id: contaId, conciliado: false, data: e.data,
          documento: e.documento || 'IXC' + String(++seq).padStart(5, '0'), tx_id: '',
          credito: e.credito, debito: e.debito,
          historico: e.credito ? 'Recebimento ' + (e.documento ? 'boleto ' + e.documento : 'cliente') : 'Lançamento de despesa',
          cliente: '', origem: e.credito ? 'retorno' : 'contas a pagar'
        }));

        if (modo === 'divergencias') {
          const fmtR = (c) => fmt.reais(c);
          const creditos = espelho.filter((m) => m.credito > 0);
          const debitos = espelho.filter((m) => m.debito > 0);
          // escolhe posições espalhadas e diferentes entre si
          const usados = new Set();
          const escolher = (lista, frac) => {
            if (!lista.length) return null;
            for (let k = 0; k < lista.length; k++) {
              const m = lista[(Math.floor(lista.length * frac) + k) % lista.length];
              if (!usados.has(m.id)) { usados.add(m.id); return m; }
            }
            return null;
          };
          const br = (iso) => fmt.brDeIso(iso);
          const remover = (m) => espelho.splice(espelho.indexOf(m), 1);

          const semBaixa = escolher(creditos, 0.15);
          if (semBaixa) { remover(semBaixa); gabarito.push(`Crédito sem baixa no IXC: ${fmtR(semBaixa.credito)} em ${br(semBaixa.data)}`); }

          const dup = escolher(creditos, 0.35);
          if (dup) {
            espelho.push(Object.assign({}, dup, { id: ++db.proximoId.mov, historico: dup.historico + ' (consulta de pagamentos)', origem: 'consulta de pagamentos' }));
            gabarito.push(`Baixa duplicada no IXC: documento ${dup.documento}, ${fmtR(dup.credito)}`);
          }

          const atrasada = escolher(creditos, 0.55);
          if (atrasada) {
            const d = new Date(atrasada.data + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 3);
            const nova = d.toISOString().slice(0, 10);
            gabarito.push(`Data de crédito diferente: ${fmtR(atrasada.credito)} — IXC em ${br(nova)}, banco em ${br(atrasada.data)}`);
            atrasada.data = nova; atrasada.documento = 'IXC' + String(++seq).padStart(5, '0');
          }

          const valorErrado = escolher(creditos, 0.75);
          if (valorErrado) {
            gabarito.push(`Valor baixado diferente: banco ${fmtR(valorErrado.credito)}, IXC ${fmtR(valorErrado.credito + 1000)} em ${br(valorErrado.data)}`);
            valorErrado.credito += 1000;
          }

          const despesa = debitos.find((m) => /TARIFA/i.test((novosExt.find((e) => e.data === m.data && e.debito === m.debito) || {}).historico || '')) || escolher(debitos, 0.5);
          if (despesa) { usados.add(despesa.id); remover(despesa); gabarito.push(`Débito do banco sem lançamento no IXC: ${fmtR(despesa.debito)} em ${br(despesa.data)}`); }

          const ultimo = novosExt.map((e) => e.data).sort().pop();
          espelho.push({ id: ++db.proximoId.mov, conta_id: contaId, conciliado: false, data: ultimo, documento: 'IXC' + String(++seq).padStart(5, '0'), tx_id: '',
            credito: 15000, debito: 0, historico: 'Recebimento manual - dinheiro no balcão', cliente: '', origem: 'manual' });
          gabarito.push(`Recebimento manual sem crédito no banco: R$ 150,00 em ${br(ultimo)}`);
        }
        db.movimentacao.push(...espelho);
      }
      await salvar();
      return { contaId, periodo: { dataIni: ofx.periodo.inicio, dataFim: ofx.periodo.fim }, gabarito };
    },

    async restaurarBase(cenarioId) {
      await carregar();
      const id = cenarioId || db.cenario || 'padrao';
      const cen = Lolla.services.cenarios[id];
      if (!cen) throw new ErroIxc(404, 'Cenário não encontrado: ' + id);
      db = Object.assign(cen.gerar(), { cenario: id });
      await salvar();
    },

    async cenarioAtual() {
      await carregar();
      return db.cenario || 'padrao';
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
    restaurarBase: (id) => cliente().restaurarBase(id),
    importarOfx: (a) => cliente().importarOfx(a),
    cenarioAtual: () => cliente().cenarioAtual ? cliente().cenarioAtual() : Promise.resolve(null)
  };
})();

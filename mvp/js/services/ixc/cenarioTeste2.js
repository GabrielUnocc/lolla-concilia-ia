/*
 * Cenário de teste 2 — Sicredi e Itaú, 16 a 24/11/2026 (dados fictícios).
 *
 * O que deve aparecer na conta Sicredi (período 16 a 24/11):
 *  1. Lote de 4 boletos pago num crédito só           -> par "lote"
 *  2. Dois boletos e dois créditos de mesmo valor/dia  -> pares "ambíguos"
 *  3. Linha repetida no OFX importado                  -> sobra no banco (OFX duplicado)
 *  4. PIX baixado 2x pelo webhook (mesmo tx_id)        -> duplicado no IXC
 *  5. Boleto pago na sexta, crédito na terça (D+2)     -> data de crédito / float
 *  6. Estorno de liquidação no banco                   -> sobra no banco (estorno)
 *  7. Bloqueio judicial na conta                       -> sobra no banco (retenção)
 *  8. Débito de convênio sem lançamento no IXC         -> sobra no banco (saída)
 *  9. Tarifa de PIX                                    -> sobra no banco (tarifa)
 * Conta Itaú: tudo bate. Ao analisar, a Lolla avisa que não precisa chamar a IA.
 */
(function () {
  const base = Lolla.services.baseSimulada;
  const DIAS = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-23', '2026-11-24'];
  const CONTAS = [
    { id: 3, descricao: 'Sicredi — CC 4455-1 (fictícia)', banco: 'Sicredi' },
    { id: 4, descricao: 'Itaú — CC 2020-3 (fictícia)', banco: 'Itaú' }
  ];

  function gerar() {
    const r = base.rng(20261116);
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    const valor = () => [5990, 6990, 8490, 10990, 13990, 15990, 17990][Math.floor(r() * 7)];
    const cpf = () => Array.from({ length: 11 }, () => Math.floor(r() * 10)).join('');
    const txid = () => 'E' + Array.from({ length: 24 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'[Math.floor(r() * 34)]).join('');
    let idMov = 245000, idExt = 97000, doc = 8812000;
    const mov = [], ext = [];
    const addMov = (o) => { const m = Object.assign({ id: ++idMov, conciliado: false, documento: '', tx_id: '', credito: 0, debito: 0, origem: 'retorno', cliente: '' }, o); mov.push(m); return m; };
    const addExt = (o) => { const e = Object.assign({ id: ++idExt, conciliado: false, documento: '', tx_id: '', credito: 0, debito: 0 }, o); ext.push(e); return e; };
    const boleto = (conta, data, v, dataBanco, hist) => {
      const d = String(++doc);
      addMov({ conta_id: conta, data, documento: d, credito: v, historico: 'Recebimento boleto ' + d, cliente: pick(base.NOMES) });
      addExt({ conta_id: conta, data: dataBanco || data, documento: d, credito: v, historico: hist || 'LIQUIDACAO BOLETO SICREDI' });
      return d;
    };

    // Rotina: tudo batendo no mesmo dia (as divergências vêm só dos casos plantados)
    CONTAS.forEach((c) => DIAS.forEach((data) => {
      const n = 3 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) boleto(c.id, data, valor(), data, c.banco === 'Itaú' ? 'RECEBIMENTO COBRANCA ITAU' : 'LIQUIDACAO BOLETO SICREDI');
      const t = txid(), v = valor(), nome = pick(base.NOMES);
      addMov({ conta_id: c.id, data, tx_id: t, credito: v, historico: 'Recebimento PIX', cliente: nome, origem: 'webhook' });
      addExt({ conta_id: c.id, data, tx_id: t, credito: v, historico: `PIX RECEBIDO - ${nome} CPF ${cpf()}` });
    }));

    const S = 3;
    // 1) Lote de 4 boletos (17/11)
    const lote = [6990, 8490, 10990, 13990].map((v) => {
      const d = String(++doc);
      return addMov({ conta_id: S, data: '2026-11-17', documento: d, credito: v, historico: 'Recebimento boleto ' + d, cliente: pick(base.NOMES) });
    });
    addExt({ conta_id: S, data: '2026-11-17', credito: lote.reduce((a, m) => a + m.credito, 0), historico: 'CRED LOTE COBRANCA 4 TIT' });
    // 2) Pares ambíguos: 2 × R$ 99,90 no mesmo dia, sem documento no extrato (18/11)
    [0, 1].forEach(() => {
      const d = String(++doc);
      addMov({ conta_id: S, data: '2026-11-18', documento: d, credito: 9990, historico: 'Recebimento boleto ' + d, cliente: pick(base.NOMES) });
      addExt({ conta_id: S, data: '2026-11-18', credito: 9990, historico: 'LIQUIDACAO BOLETO SICREDI' });
    });
    // 3) Linha repetida no OFX (19/11)
    const dRep = boleto(S, '2026-11-19', 15990);
    addExt({ conta_id: S, data: '2026-11-19', documento: dRep, credito: 15990, historico: 'LIQUIDACAO BOLETO SICREDI' });
    // 4) PIX baixado 2x pelo webhook (19/11)
    const tDup = txid(), nDup = pick(base.NOMES);
    addMov({ conta_id: S, data: '2026-11-19', tx_id: tDup, credito: 12000, historico: 'Recebimento PIX', cliente: nDup, origem: 'webhook' });
    addMov({ conta_id: S, data: '2026-11-19', tx_id: tDup, credito: 12000, historico: 'Recebimento PIX (notificação repetida)', cliente: nDup, origem: 'webhook' });
    addExt({ conta_id: S, data: '2026-11-19', tx_id: tDup, credito: 12000, historico: `PIX RECEBIDO - ${nDup} CPF ${cpf()}` });
    // 5) Boleto pago na sexta (20/11), crédito na terça (24/11) — float D+2
    const dFloat = String(++doc);
    addMov({ conta_id: S, data: '2026-11-20', documento: dFloat, credito: 21990, historico: 'Recebimento boleto ' + dFloat, cliente: pick(base.NOMES) });
    addExt({ conta_id: S, data: '2026-11-24', credito: 21990, historico: 'LIQUIDACAO BOLETO SICREDI' });
    // 6) Estorno de liquidação (23/11)
    addExt({ conta_id: S, data: '2026-11-23', debito: 8490, historico: 'ESTORNO LIQUIDACAO BOLETO' });
    // 7) Bloqueio judicial (23/11)
    addExt({ conta_id: S, data: '2026-11-23', debito: 120000, historico: 'BLOQ JUDICIAL SISBAJUD' });
    // 8) Convênio debitado sem lançamento (16/11)
    addExt({ conta_id: S, data: '2026-11-16', debito: 82045, historico: 'PAGTO CONVENIO ENERGIA' });
    // 9) Tarifa de PIX (24/11)
    addExt({ conta_id: S, data: '2026-11-24', debito: 450, historico: 'TARIFA PIX RECEBIDO' });

    return { versao: 1, contas: CONTAS, movimentacao: mov, extrato: ext, proximoId: { mov: idMov, ext: idExt } };
  }

  Lolla.services.cenarios['teste-2'] = {
    nome: 'Cenário 2 — Sicredi e Itaú (16 a 24/11)',
    descricao: 'Lote de 4 boletos, pares ambíguos, OFX com linha repetida, PIX baixado 2x, float D+2, estorno, bloqueio judicial, convênio e tarifa. A conta Itaú fecha sem divergência.',
    periodo: { dataIni: '2026-11-16', dataFim: '2026-11-24' },
    gerar
  };
})();

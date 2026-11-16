/*
 * Base de dados simulada do IXC (centralizada).
 * Gera, de forma determinística, contas, movimentação financeira (fn_movim_finan)
 * e extrato bancário (fn_extrato), com os cenários de divergência já conhecidos.
 * Todos os nomes, CPFs e documentos são fictícios.
 */
Lolla.services.baseSimulada = (function () {
  const fmt = Lolla.core.fmt;

  function rng(semente) { // mulberry32
    return function () {
      semente |= 0; semente = (semente + 0x6D2B79F5) | 0;
      let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const NOMES = ['ANA PAULA REIS', 'BRUNO COSTA LIMA', 'CARLA MENDES', 'DIEGO SOUZA', 'ELAINE PRADO', 'FABIO NUNES', 'GISELE ROCHA',
    'HEITOR ALVES', 'IARA FONTES', 'JOAO VITOR MAIA', 'KAREN DIAS', 'LUCAS TEIXEIRA', 'MARINA LOPES', 'NATAN BRITO', 'OTAVIO SALES',
    'PRISCILA VAZ', 'RAFAEL CUNHA', 'SABRINA MOTA', 'TIAGO FREIRE', 'VANESSA LEAL'];

  const CONTAS = [
    { id: 1, descricao: 'Sicoob — CC 12345-6 (fictícia)', banco: 'Sicoob' },
    { id: 2, descricao: 'Bradesco — CC 9876-5 (fictícia)', banco: 'Bradesco' }
  ];

  const DIAS = ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'];

  function proximoDiaUtil(iso, n) {
    const i = DIAS.indexOf(iso);
    return DIAS[Math.min(i + (n || 1), DIAS.length - 1)];
  }

  function gerar() {
    const r = rng(20261103);
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    const valor = () => [4990, 6000, 7990, 8990, 9990, 11990, 12990, 14990, 19990][Math.floor(r() * 9)];
    const cpf = () => Array.from({ length: 11 }, () => Math.floor(r() * 10)).join('');
    const txid = () => 'E' + Array.from({ length: 24 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'[Math.floor(r() * 34)]).join('');

    let idMov = 131300, idExt = 88000, doc = 7178300;
    const mov = [], ext = [];

    const addMov = (o) => { const m = Object.assign({ id: ++idMov, conciliado: false, documento: '', tx_id: '', credito: 0, debito: 0, origem: 'retorno', cliente: '' }, o); mov.push(m); return m; };
    const addExt = (o) => { const e = Object.assign({ id: ++idExt, conciliado: false, documento: '', tx_id: '', credito: 0, debito: 0 }, o); ext.push(e); return e; };
    const histBoleto = (banco) => banco === 'Sicoob' && r() < 0.5 ? 'CRÃD.LIQUIDAÃÃO COBRANÃA' : 'CRED.LIQUIDACAO COBRANCA';

    CONTAS.forEach((conta) => {
      DIAS.forEach((data) => {
        // Boletos liquidados (retorno) — banco credita no mesmo dia ou D+1
        const n = 3 + Math.floor(r() * 4);
        for (let k = 0; k < n; k++) {
          const v = valor(), d = String(++doc), nome = pick(NOMES);
          addMov({ conta_id: conta.id, data, documento: d, credito: v, historico: 'Recebimento boleto ' + d, cliente: nome, origem: 'retorno' });
          if (r() < 0.75) addExt({ conta_id: conta.id, data, documento: d, credito: v, historico: histBoleto(conta.banco) });
          else addExt({ conta_id: conta.id, data: proximoDiaUtil(data), credito: v, historico: histBoleto(conta.banco) });
        }
        // PIX via webhook
        const nPix = 1 + Math.floor(r() * 2);
        for (let k = 0; k < nPix; k++) {
          const v = valor(), t = txid(), nome = pick(NOMES);
          addMov({ conta_id: conta.id, data, tx_id: t, credito: v, historico: 'Recebimento PIX', cliente: nome, origem: 'webhook' });
          addExt({ conta_id: conta.id, data, tx_id: t, credito: v, historico: `PIX RECEBIDO - ${nome} CPF ${cpf()}` });
        }
        // Saída (pagamento a fornecedor)
        if (r() < 0.6) {
          const v = 25000 + Math.floor(r() * 40) * 1000, d = 'NF' + Math.floor(1000 + r() * 8999);
          addMov({ conta_id: conta.id, data, documento: d, debito: v, historico: 'Pagamento fornecedor ' + d, origem: 'contas a pagar' });
          addExt({ conta_id: conta.id, data, documento: d, debito: v, historico: 'PAGTO TITULO ' + d });
        }
      });
    });

    /* ---------- Cenários plantados (conta 1 — Sicoob) ---------- */
    const c = 1;
    // 03/11 — crédito em lote (soma de 3 boletos)
    const lote = [8990, 11990, 14990].map((v) => {
      const d = String(++doc);
      return addMov({ conta_id: c, data: '2026-11-03', documento: d, credito: v, historico: 'Recebimento boleto ' + d, cliente: pick(NOMES), origem: 'retorno' });
    });
    addExt({ conta_id: c, data: '2026-11-03', credito: lote.reduce((a, m) => a + m.credito, 0), historico: 'CRED LOTE COBRANCA' });
    // 03/11 — entrada diversa no banco não lançada no IXC
    addExt({ conta_id: c, data: '2026-11-03', credito: 1837, historico: 'RENDIMENTO APLIC AUTOMATICA' });
    // 04/11 — baixa duplicada (webhook + consulta de pagamentos)
    const dDup = String(++doc), nDup = pick(NOMES);
    addMov({ conta_id: c, data: '2026-11-04', documento: dDup, credito: 12990, historico: 'Recebimento boleto ' + dDup, cliente: nDup, origem: 'webhook' });
    addMov({ conta_id: c, data: '2026-11-04', documento: dDup, credito: 12990, historico: 'Recebimento boleto ' + dDup + ' (consulta)', cliente: nDup, origem: 'consulta de pagamentos' });
    addExt({ conta_id: c, data: '2026-11-04', documento: dDup, credito: 12990, historico: 'CRED.LIQUIDACAO COBRANCA' });
    // 04/11 — tarifa bancária
    addExt({ conta_id: c, data: '2026-11-04', debito: 1260, historico: 'TARIFA COBRANCA 7 TITULOS' });
    // 05/11 — recebimento manual sem crédito no banco
    addMov({ conta_id: c, data: '2026-11-05', documento: String(++doc), credito: 9990, historico: 'Recebimento manual - dinheiro no balcão', cliente: pick(NOMES), origem: 'manual' });
    // 05/11 — PIX no banco sem baixa no IXC
    addExt({ conta_id: c, data: '2026-11-05', tx_id: txid(), credito: 7990, historico: `PIX RECEBIDO - ${pick(NOMES)} CPF ${cpf()}` });
    // 06/11 — data de crédito incorreta (IXC 03/11, banco 06/11)
    const dData = String(++doc);
    addMov({ conta_id: c, data: '2026-11-03', documento: dData, credito: 19990, historico: 'Recebimento boleto ' + dData, cliente: pick(NOMES), origem: 'retorno' });
    addExt({ conta_id: c, data: '2026-11-06', credito: 19990, historico: 'CRED.LIQUIDACAO COBRANCA' });
    // 06/11 — estorno no banco
    addExt({ conta_id: c, data: '2026-11-06', debito: 6000, historico: 'ESTORNO PIX DEVOLUCAO' });

    /* ---------- Conta 2 — Bradesco ---------- */
    addExt({ conta_id: 2, data: '2026-11-04', tx_id: txid(), credito: 11990, historico: `PIX RECEBIDO - ${pick(NOMES)} CPF ${cpf()}` });
    const dDup2 = String(++doc), nDup2 = pick(NOMES);
    addMov({ conta_id: 2, data: '2026-11-05', documento: dDup2, credito: 8990, historico: 'Recebimento boleto ' + dDup2, cliente: nDup2, origem: 'retorno' });
    addMov({ conta_id: 2, data: '2026-11-05', documento: dDup2, credito: 8990, historico: 'Recebimento boleto ' + dDup2 + ' (manual)', cliente: nDup2, origem: 'manual' });
    addExt({ conta_id: 2, data: '2026-11-05', documento: dDup2, credito: 8990, historico: 'LIQUIDACAO BOLETO' });

    return { versao: 1, contas: CONTAS, movimentacao: mov, extrato: ext, proximoId: { mov: idMov, ext: idExt } };
  }

  return { gerar, DIAS, rng, NOMES, fmt };
})();

/* Registro de cenários de teste. Outros arquivos (ex.: cenarioTeste2.js) se adicionam aqui. */
Lolla.services.cenarios = {
  padrao: {
    nome: 'Cenário 1 — Sicoob e Bradesco (03 a 13/11)',
    descricao: 'Lote, rendimento não lançado, baixa duplicada, tarifa, recebimento manual, PIX sem baixa, data de crédito e estorno.',
    periodo: { dataIni: '2026-11-03', dataFim: '2026-11-06' },
    gerar: () => Lolla.services.baseSimulada.gerar()
  }
};

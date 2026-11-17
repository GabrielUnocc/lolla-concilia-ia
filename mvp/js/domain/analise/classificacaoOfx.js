/*
 * Modo Análise — classificação das descrições do OFX (issue #7).
 * Ordem: estorno -> regras do banco -> regras genéricas -> sinal do valor -> "não classificado".
 * Compara pela chaveTexto (sem acento, maiúsculas), então tolera "CRÃD.LIQUIDAÃÃO".
 * A classificação é só uma etiqueta: o motor nunca pareia por ela sozinha.
 */
(function (g) {
  const A = g.Lolla.domain.analise;

  const CATEGORIAS = {
    recebimento: 'Recebimento',
    tarifa: 'Tarifa',
    estorno: 'Estorno',
    transferencia: 'Transferência',
    rendimento: 'Rendimento / aplicação',
    retencao: 'Retenção / bloqueio',
    saida: 'Saída',
    nao_classificado: 'Não classificado'
  };

  // Regras genéricas, válidas para qualquer banco. "sinal": só se aplica a créditos (+) ou débitos (-).
  const GENERICAS = [
    { categoria: 'tarifa', padrao: /\bTAR\b|\bTARIFA|\bTARIF\b|\bTAXA\b|\bCESTA\b|\bMANUT\w* CONTA/ },
    { categoria: 'retencao', padrao: /\bBLOQ\w*|\bRETENC\w*|\bRETIDO|\bJUDICIAL|\bPENHORA/ },
    { categoria: 'rendimento', padrao: /\bRENDIMENTO|\bRENDE FACIL|\bAPLIC\w*|\bRESGATE|\bJUROS\b|\bREND PAGO/ },
    { categoria: 'recebimento', subtipo: 'cobrança', sinal: '+', padrao: /\bLIQUID\w*|\bLIQ\w* COB|\bCOBRAN\w*|\bBOLETO|\bTITULO|\bCOB\b/ },
    { categoria: 'recebimento', subtipo: 'pix', sinal: '+', padrao: /\bPIX\b/ },
    { categoria: 'transferencia', padrao: /\bTED\b|\bDOC\b|\bTRANSF\w*|\bTEV\b/ },
    { categoria: 'recebimento', subtipo: 'cartão', sinal: '+', padrao: /\bCIELO|\bREDE\b|\bSTONE|\bGETNET|\bCARTAO/ }
  ];

  function aplica(regra, chave, valor) {
    if (regra.sinal === '+' && valor < 0) return false;
    if (regra.sinal === '-' && valor > 0) return false;
    return regra.padrao.test(chave);
  }

  // lanc: { descricao, valor (centavos, negativo = débito), tipo (TRNTYPE) }
  function classificar(lanc, banco) {
    const chave = A.norm.chaveTexto(lanc.descricao || '');
    if (/\bESTORN\w*|\bDEVOLU\w*|\bDEVOL\b/.test(chave)) return { categoria: 'estorno', regra: 'genérica: estorno/devolução' };
    const regrasBanco = (banco && banco.regrasOfx) || [];
    for (const r of regrasBanco) {
      if (aplica(r, chave, lanc.valor)) return { categoria: r.categoria, subtipo: r.subtipo, regra: `${banco.nome}: ${r.padrao.source}` };
    }
    for (const r of GENERICAS) {
      if (aplica(r, chave, lanc.valor)) {
        // transferência/pix de saída é saída comum
        if (lanc.valor < 0 && (r.categoria === 'transferencia')) return { categoria: 'saida', subtipo: 'transferência', regra: 'genérica: transferência enviada' };
        return { categoria: r.categoria, subtipo: r.subtipo, regra: 'genérica: ' + r.padrao.source };
      }
    }
    if (lanc.valor < 0) return { categoria: 'saida', regra: 'sinal negativo' };
    return { categoria: 'nao_classificado', regra: 'nenhuma regra se aplica' };
  }

  A.classificacaoOfx = { classificar, CATEGORIAS, GENERICAS };
})(typeof self !== 'undefined' ? self : globalThis);

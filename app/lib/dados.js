// Normaliza o JSON extraído da tela de Conciliação Manual do IXC Provedor.
// Aceita os nomes de campo puros (id, data, credito...) ou com o prefixo do
// atributo abbr da grade (fn_movim_finan.id, fn_extrato.credito...).

export class ErroValidacao extends Error {}

const CAMPOS = ['id', 'conciliado', 'data', 'documento', 'tx_id', 'credito', 'debito', 'historico'];

/** "1.234,56" | "60,00" | "0" | 60 | -2.9 -> centavos (inteiro). */
export function paraCentavos(v, onde) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new ErroValidacao(`${onde}: valor inválido`);
    return Math.round(v * 100);
  }
  const s = String(v).trim().replace(/^R\$\s*/, '');
  let m = s.match(/^(-)?(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?$/);
  if (m) {
    const inteiro = m[2].replace(/\./g, '');
    const dec = (m[3] || '0').padEnd(2, '0');
    const c = Number(inteiro) * 100 + Number(dec);
    return m[1] ? -c : c;
  }
  // Ponto decimal sem separador de milhar (ex.: "60.5"), comum em exportações.
  m = s.match(/^(-)?(\d+)\.(\d{1,2})$/);
  if (m) {
    const c = Number(m[2]) * 100 + Number(m[3].padEnd(2, '0'));
    return m[1] ? -c : c;
  }
  throw new ErroValidacao(`${onde}: valor "${s}" não está no formato 0,00`);
}

/** "02/11/2026" | "2026-11-02" -> "2026-11-02". */
export function paraISO(v, onde) {
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  let iso = m ? `${m[3]}-${m[2]}-${m[1]}` : null;
  if (!iso) {
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) iso = `${m[1]}-${m[2]}-${m[3]}`;
  }
  if (!iso) throw new ErroValidacao(`${onde}: data "${s}" não está no formato dd/mm/aaaa`);
  const d = new Date(iso + 'T00:00:00Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) {
    throw new ErroValidacao(`${onde}: data "${s}" não existe`);
  }
  return iso;
}

function paraBool(v) {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').trim().toLowerCase();
  if (s.includes('fa-check')) return true; // classe do ícone da coluna Conc.
  return ['1', 's', 'sim', 'true', 'y', 'yes'].includes(s);
}

/**
 * Converte o formato da extensão "Leitor de Conciliacao IXC" (grid_esquerda_ixc /
 * grid_direita_extrato com linhas { campos, tipo_linha }) para o formato interno.
 * Linhas "agrupador_data" (subtotal do dia, quando o IXC agrupa por dia) são ignoradas.
 */
function deExtensao(bruto) {
  const linhas = (grade) => (grade?.linhas || [])
    .filter((l) => (l.tipo_linha || 'lancamento') === 'lancamento')
    .map((l) => {
      const c = semPrefixo(l.campos);
      if (c.documento === '-') c.documento = '';
      if (c.historico === '-') c.historico = '';
      return c;
    });
  const rv = bruto.resumo_valores || {};
  const totais = {};
  for (const t of bruto.totais_rodape || []) if (t?.id) totais[t.id] = t.value;
  return {
    capturado_em: bruto._meta?.capturado_em ?? null,
    filtros: { conta: rv.conta_label, data_inicial: rv.periodo_inicial, data_final: rv.periodo_final },
    totais,
    origem: {
      extensao: bruto._meta?.origem ?? null,
      lote_id: rv.lote_id ?? null,
      arquivo_ofx: rv.arquivo_ofx_nome ?? null,
      agrupado_por_dia: rv.mostrar_agrupado_por_dia === 'S',
    },
    movimentacao: linhas(bruto.grid_esquerda_ixc),
    extrato: linhas(bruto.grid_direita_extrato),
  };
}

function semPrefixo(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) out[k.includes('.') ? k.split('.').pop() : k] = v;
  return out;
}

function normalizarLinhas(lista, lado, nomeLado) {
  if (!Array.isArray(lista)) throw new ErroValidacao(`"${lado}" precisa ser uma lista de linhas`);
  const vistos = new Set();
  return lista.map((bruta, i) => {
    if (!bruta || typeof bruta !== 'object') throw new ErroValidacao(`${nomeLado}, linha ${i + 1}: não é um objeto`);
    const r = semPrefixo(bruta);
    const onde = `${nomeLado}, linha ${i + 1}`;
    const id = String(r.id ?? '').trim();
    if (!id) throw new ErroValidacao(`${onde}: campo "id" vazio`);
    if (vistos.has(id)) throw new ErroValidacao(`${onde}: id ${id} aparece mais de uma vez`);
    vistos.add(id);
    const linha = {
      id,
      conciliado: paraBool(r.conciliado),
      data: paraISO(r.data, onde),
      documento: String(r.documento ?? '').trim(),
      tx_id: String(r.tx_id ?? '').trim(),
      credito: paraCentavos(r.credito, `${onde}, entrada`),
      debito: paraCentavos(r.debito, `${onde}, saída`),
      historico: String(r.historico ?? '').trim(),
    };
    for (const k of Object.keys(r)) if (!CAMPOS.includes(k)) linha.extras = { ...(linha.extras || {}), [k]: r[k] };
    return linha;
  });
}

const liquido = (r) => r.credito - r.debito;
const formatar = (c) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Recebe o objeto do arquivo JSON e devolve { dados, avisos, sugestao }.
 * `sugestao` traz conta e período lidos da aba Filtros, se vieram no arquivo.
 */
export function normalizarDados(bruto) {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) {
    throw new ErroValidacao('O arquivo precisa ser um objeto JSON com "movimentacao" e "extrato"');
  }
  if (bruto.grid_esquerda_ixc || bruto.grid_direita_extrato) bruto = deExtensao(bruto);
  const movimentacao = normalizarLinhas(bruto.movimentacao, 'movimentacao', 'Movimentação Financeira');
  const extrato = normalizarLinhas(bruto.extrato, 'extrato', 'Extrato Bancário');
  if (!movimentacao.length && !extrato.length) throw new ErroValidacao('As duas grades estão vazias');

  const avisos = [];
  const pend = (l) => l.filter((r) => !r.conciliado).reduce((a, r) => a + liquido(r), 0);
  const calc = { mov: pend(movimentacao), ext: pend(extrato) };

  const t = semPrefixo(bruto.totais);
  const conferir = (chave, valorCalc, rotulo) => {
    if (t[chave] === undefined || t[chave] === '') return;
    let tela;
    try { tela = paraCentavos(t[chave], `totais.${chave}`); } catch { return; }
    if (tela !== valorCalc) {
      avisos.push(`${rotulo}: a tela do IXC mostrava ${formatar(tela)}, mas as linhas do arquivo somam ${formatar(valorCalc)}. A extração pode estar incompleta.`);
    }
  };
  conferir('total_a_conciliar_aba3_mov', calc.mov, 'Total a conciliar (Movimentação)');
  conferir('total_a_conciliar_mov', calc.mov, 'Total a conciliar (Movimentação)');
  conferir('total_a_conciliar_aba3_ext', calc.ext, 'Total a conciliar (Extrato)');
  conferir('total_a_conciliar_ext', calc.ext, 'Total a conciliar (Extrato)');

  const f = semPrefixo(bruto.filtros);
  const sugestao = {};
  if (f.conta) sugestao.conta = String(f.conta).trim();
  try { if (f.data_inicial) sugestao.data_inicial = paraISO(f.data_inicial, 'filtros.data_inicial'); } catch { /* ignora */ }
  try { if (f.data_final) sugestao.data_final = paraISO(f.data_final, 'filtros.data_final'); } catch { /* ignora */ }

  return {
    dados: { movimentacao, extrato, capturado_em: bruto.capturado_em ?? null, totais_tela: bruto.totais ?? null, origem: bruto.origem ?? null },
    avisos,
    sugestao,
  };
}

export function avisosDePeriodo(dados, ini, fim) {
  const fora = (l) => l.filter((r) => r.data < ini || r.data > fim).length;
  const a = fora(dados.movimentacao), b = fora(dados.extrato);
  const out = [];
  if (a) out.push(`${a} linha(s) da Movimentação Financeira estão fora do período informado.`);
  if (b) out.push(`${b} linha(s) do Extrato Bancário estão fora do período informado.`);
  return out;
}

/** Situação calculada a partir dos dados e dos vínculos feitos aqui. */
export function resumo(dados, vinculos) {
  const usadosIxc = new Set(vinculos.flatMap((v) => v.ixc_ids));
  const usadosExt = new Set(vinculos.flatMap((v) => v.ext_ids));
  const pIxc = dados.movimentacao.filter((r) => !r.conciliado && !usadosIxc.has(r.id));
  const pExt = dados.extrato.filter((r) => !r.conciliado && !usadosExt.has(r.id));
  const tIxc = pIxc.reduce((a, r) => a + liquido(r), 0);
  const tExt = pExt.reduce((a, r) => a + liquido(r), 0);
  return {
    pendentes_ixc: pIxc.length,
    pendentes_ext: pExt.length,
    total_a_conciliar_ixc: tIxc,
    total_a_conciliar_ext: tExt,
    diferenca: tIxc - tExt,
    vinculos: vinculos.length,
    linhas_ixc: dados.movimentacao.length,
    linhas_ext: dados.extrato.length,
  };
}

export { liquido };

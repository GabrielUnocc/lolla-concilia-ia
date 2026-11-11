import { $, api, esc, dinheiro, dataBR, dataHoraBR, iniciarTopo, aviso } from './comum.js';

const id = Number(new URLSearchParams(location.search).get('id'));
const ABAS = [['filtros', 'Filtros'], ['auto', 'Conciliação Automática'], ['manual', 'Conciliação Manual'], ['todos', 'Todos os conciliados']];
const CAMPOS_BUSCA = [['*', 'Todos'], ['id', 'ID'], ['data', 'Data'], ['documento', 'Documento'], ['credito', 'Entrada'], ['debito', 'Saída'], ['historico', 'Histórico']];
const LADOS = { ixc: 'movimentacao', ext: 'extrato' };

const S = {
  c: null,
  aba: 'manual',
  sel: { ixc: new Set(), ext: new Set() },
  busca: { ixc: { campo: '*', q: '' }, ext: { campo: '*', q: '' } },
  // Ordenação por coluna em cada grade: { campo, dir } com dir -1 (maior → menor) ou 1 (menor → maior).
  ordem: { ixc: null, ext: null },
  // Pares 1:1 montados por "Selecionar valores iguais" ou por um valor específico.
  pares: null,
  valorEscolhido: '',
};

const liquido = (r) => r.credito - r.debito;
const linhas = (lado) => S.c.dados[LADOS[lado]];
const usados = (lado) => new Set(S.c.vinculos.flatMap((v) => (lado === 'ixc' ? v.ixc_ids : v.ext_ids)));
const pendentes = (lado) => { const u = usados(lado); return linhas(lado).filter((r) => !r.conciliado && !u.has(r.id)); };
const porId = (lado, rid) => linhas(lado).find((r) => r.id === rid);
const soma = (l) => l.reduce((a, r) => a + liquido(r), 0);

function estadoSelecao() {
  const a = pendentes('ixc').filter((r) => S.sel.ixc.has(r.id));
  const b = pendentes('ext').filter((r) => S.sel.ext.has(r.id));
  const sa = soma(a), sb = soma(b);
  return { na: a.length, nb: b.length, sa, sb, ok: a.length > 0 && b.length > 0 && sa === sb };
}

// ---------- grades ----------
const COLUNAS = [
  ['id', 'ID', 'c'], [null, 'Conc.', 'c'], ['data', 'Data', 'c'], ['documento', 'Documento', ''],
  ['tx_id', 'ID da transação', ''], ['credito', 'Entrada', 'd'], ['debito', 'Saída', 'd'], ['historico', 'Histórico', ''],
];

/** Cabeçalho da grade. Com `lado`, as colunas ficam clicáveis para ordenar. */
function cabecalho(comSelecao, lado) {
  const o = lado ? S.ordem[lado] : null;
  const ths = COLUNAS.map(([campo, rotulo, cls]) => {
    if (!lado || !campo) return `<th class="${cls}">${rotulo}</th>`;
    const ativo = o && o.campo === campo;
    const seta = ativo ? (o.dir < 0 ? '▼' : '▲') : '↕';
    const dica = !ativo ? 'Ordenar do maior para o menor' : o.dir < 0 ? 'Ordenar do menor para o maior' : 'Voltar à ordem original';
    return `<th class="${cls} ordenavel${ativo ? ' ativa' : ''}" data-ordem="${campo}" title="${dica}"
      aria-sort="${ativo ? (o.dir < 0 ? 'descending' : 'ascending') : 'none'}">${rotulo}<span class="seta">${seta}</span></th>`;
  }).join('');
  return `<tr>${comSelecao ? '<th class="c">-</th>' : ''}${ths}</tr>`;
}

const ehNumero = (s) => /^\d+$/.test(s);
function comparar(a, b, campo) {
  const x = a[campo], y = b[campo];
  if (typeof x === 'number') return x - y; // credito/debito em centavos
  if (campo === 'data') return x < y ? -1 : x > y ? 1 : 0; // ISO aaaa-mm-dd
  if (ehNumero(x) && ehNumero(y)) return x.length - y.length || (x < y ? -1 : x > y ? 1 : 0); // ids e documentos numéricos sem perder precisão
  if (!x !== !y) return x ? 1 : -1; // vazios ficam como "menores"
  return String(x).localeCompare(String(y), 'pt-BR', { sensitivity: 'base', numeric: true });
}
function ordenar(lista, lado) {
  const o = S.ordem[lado];
  if (!o) return lista;
  return [...lista].sort((a, b) => o.dir * comparar(a, b, o.campo)); // sort é estável: empates mantêm a ordem do IXC
}

function confere(r, campo, q) {
  if (!q) return true;
  const v = { id: r.id, data: dataBR(r.data), documento: r.documento, credito: dinheiro(r.credito), debito: dinheiro(r.debito), historico: r.historico };
  const alvo = campo === '*' ? Object.values(v) : [v[campo]];
  return alvo.some((x) => String(x).toLowerCase().includes(q));
}

function linhaHTML(r, { selecao, classe = '', conc }) {
  return `<tr class="${selecao ? 'clicavel ' : ''}${classe}" data-id="${esc(r.id)}">
    ${selecao ? `<td class="c"><input type="checkbox" ${selecao.marcado ? 'checked' : ''} aria-label="Selecionar ${esc(r.id)}"></td>` : ''}
    <td class="c">${esc(r.id)}</td>
    <td class="c">${conc ? '<span class="ic-sim" title="Conciliado">✓</span>' : '<span class="ic-nao" title="Não conciliado">✗</span>'}</td>
    <td class="c">${dataBR(r.data)}</td>
    <td>${esc(r.documento)}</td>
    <td>${esc(r.tx_id)}</td>
    <td class="d">${dinheiro(r.credito)}</td>
    <td class="d">${dinheiro(r.debito)}</td>
    <td title="${esc(r.historico)}">${esc(r.historico)}</td>
  </tr>`;
}

// ---------- valores iguais ----------
/** Agrupa as linhas pendentes de cada lado por valor líquido (centavos). Ignora valor zero. */
function porValor() {
  const m = new Map();
  for (const lado of ['ixc', 'ext']) {
    for (const r of pendentes(lado)) {
      const v = liquido(r);
      if (!v) continue;
      if (!m.has(v)) m.set(v, { ixc: [], ext: [] });
      m.get(v)[lado].push(r);
    }
  }
  return m;
}

const dias = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
const mesmaReferencia = (a, b) => (a.documento && a.documento === b.documento) || (a.tx_id && a.tx_id === b.tx_id);

// Palavras do histórico que não identificam o cliente (prefixos do banco e do IXC).
const PALAVRAS_GENERICAS = new Set(('REC RECEB RECEBIMENTO COB COBRAN HIBRIDA PIXCOBRAN PIX CRED TITULOS TITULO GATEWAY DOC TED LIQ ' +
  'COBRANCA SIMPLES LTDA EIRELI EPP DOS DAS DE DA DO E ME SA NOVO').split(' '));
const cacheNomes = new Map();
/** Palavras do histórico que parecem nome (sem acento, maiúsculas, sem números e termos genéricos). */
function nomes(h) {
  if (cacheNomes.has(h)) return cacheNomes.get(h);
  const s = new Set(String(h).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .split(/[^A-Z]+/).filter((w) => w.length >= 3 && !PALAVRAS_GENERICAS.has(w)));
  cacheNomes.set(h, s);
  return s;
}
const nomesEmComum = (a, b) => { let n = 0; for (const w of nomes(a.historico)) if (nomes(b.historico).has(w)) n++; return n; };

/**
 * Monta pares 1:1 entre linhas de mesmo valor. Quando o valor se repete, escolhe o par por:
 * 1) documento ou ID da transação iguais; 2) mais nomes em comum no histórico; 3) data mais próxima.
 * Com `so`, considera só esse valor (centavos).
 */
function montarPares(so) {
  const pares = [];
  let repetidos = 0;
  for (const [v, g] of porValor()) {
    if (so !== undefined && v !== so) continue;
    if (!g.ixc.length || !g.ext.length) continue;
    if (g.ixc.length > 1 || g.ext.length > 1) repetidos++;
    const candidatos = [];
    g.ixc.forEach((a, ia) => g.ext.forEach((b, ib) => candidatos.push({
      a, b, ordem: ia * g.ext.length + ib,
      ref: mesmaReferencia(a, b) ? 1 : 0, nome: nomesEmComum(a, b), dias: dias(a.data, b.data),
    })));
    candidatos.sort((x, y) => y.ref - x.ref || y.nome - x.nome || x.dias - y.dias || x.ordem - y.ordem);
    const usadosI = new Set(), usadosE = new Set();
    const ambiguo = g.ixc.length > 1 || g.ext.length > 1;
    for (const c of candidatos) {
      if (usadosI.has(c.a.id) || usadosE.has(c.b.id)) continue;
      usadosI.add(c.a.id); usadosE.add(c.b.id);
      // criterio: só importa quando o valor se repete (com 1 linha de cada lado o par é único)
      const criterio = !ambiguo ? 'unico' : c.ref ? 'referencia' : c.nome >= 2 ? 'nome' : 'incerto';
      pares.push({ ixc: [c.a.id], ext: [c.b.id], valor: v, criterio });
    }
  }
  return { pares, repetidos };
}

function aplicarPares(r) {
  S.pares = r.pares.length ? r.pares : null;
  S.repetidos = r.repetidos;
  S.sel.ixc = new Set(r.pares.flatMap((p) => p.ixc));
  S.sel.ext = new Set(r.pares.flatMap((p) => p.ext));
}

/** true se a seleção atual é exatamente a dos pares montados (o usuário não mexeu depois). */
function selecaoEhDosPares() {
  if (!S.pares) return false;
  const i = S.pares.flatMap((p) => p.ixc), e = S.pares.flatMap((p) => p.ext);
  return i.length === S.sel.ixc.size && e.length === S.sel.ext.size && i.every((x) => S.sel.ixc.has(x)) && e.every((x) => S.sel.ext.has(x));
}

/** Ex.: ": 2 pares pelo documento, 5 pelo nome no histórico e 8 só pelo valor (confira estes)" */
function resumoCriterios() {
  const n = { referencia: 0, nome: 0, incerto: 0 };
  for (const p of S.pares) if (p.criterio in n) n[p.criterio]++;
  const partes = [];
  if (n.referencia) partes.push(`${n.referencia} pelo documento/ID da transação`);
  if (n.nome) partes.push(`${n.nome} pelo nome no histórico`);
  if (n.incerto) partes.push(`<b>${n.incerto} só pelo valor</b> (confira estes: o nome não bate)`);
  if (!partes.length) return '';
  const ultimo = partes.pop();
  return ': ' + (partes.length ? partes.join(', ') + ' e ' : '') + ultimo;
}

function desenharBarraPares() {
  const grupos = [...porValor()].filter(([, g]) => g.ixc.length && g.ext.length).sort((a, b) => b[0] - a[0]);
  const totalPares = grupos.reduce((s, [, g]) => s + Math.min(g.ixc.length, g.ext.length), 0);
  if (S.valorEscolhido && !grupos.some(([v]) => String(v) === S.valorEscolhido)) S.valorEscolhido = '';
  $('#sel-valor').innerHTML = `<option value="">${grupos.length ? 'Ou escolha um valor específico…' : 'Nenhum valor igual nos dois lados'}</option>` +
    grupos.map(([v, g]) => {
      const n = Math.min(g.ixc.length, g.ext.length);
      return `<option value="${v}"${String(v) === S.valorEscolhido ? ' selected' : ''}>${dinheiro(v)} · ${g.ixc.length} no IXC / ${g.ext.length} no extrato · ${n} par${n > 1 ? 'es' : ''}</option>`;
    }).join('');
  $('#sel-valor').disabled = !grupos.length;
  $('#btn-iguais').disabled = !grupos.length;
  $('#btn-iguais').textContent = grupos.length ? `Selecionar valores iguais (${totalPares})` : 'Selecionar valores iguais';
  $('#btn-limpar').disabled = !S.sel.ixc.size && !S.sel.ext.size;

  const info = $('#info-pares');
  if (selecaoEhDosPares()) {
    const total = S.pares.reduce((s, p) => s + p.valor, 0);
    info.innerHTML = `<b>${S.pares.length} par${S.pares.length > 1 ? 'es' : ''}</b> selecionado${S.pares.length > 1 ? 's' : ''} (${dinheiro(total)}).` +
      (S.repetidos ? ` ${S.repetidos} valor${S.repetidos > 1 ? 'es se repetem' : ' se repete'}${resumoCriterios()}.` : '') +
      ' Cada par vira um vínculo separado.';
  } else if (grupos.length) {
    info.textContent = `${grupos.length} valor${grupos.length > 1 ? 'es aparecem' : ' aparece'} nos dois lados (${totalPares} par${totalPares > 1 ? 'es' : ''} possíve${totalPares > 1 ? 'is' : 'l'}).`;
  } else {
    info.textContent = '';
  }
}

function desenharManual() {
  if (S.pares && !selecaoEhDosPares()) { S.pares = null; S.valorEscolhido = ''; }
  desenharBarraPares();
  const st = estadoSelecao();
  for (const lado of ['ixc', 'ext']) {
    const { campo, q } = S.busca[lado];
    const todos = pendentes(lado);
    const visiveis = ordenar(todos.filter((r) => confere(r, campo, q.trim().toLowerCase())), lado);
    $(`#h-${lado}`).innerHTML = cabecalho(true, lado);
    $(`#q-${lado}`).textContent = visiveis.length === todos.length ? `${todos.length} a conciliar` : `${visiveis.length} de ${todos.length}`;
    $(`#g-${lado}`).innerHTML = visiveis.length
      ? visiveis.map((r) => {
        const m = S.sel[lado].has(r.id);
        return linhaHTML(r, { selecao: { marcado: m }, classe: m ? (st.ok ? 'sel-ok' : 'sel-erro') : '', conc: false });
      }).join('')
      : `<tr><td colspan="9" class="vazio">${todos.length ? 'Nada encontrado com essa busca.' : 'Nenhum registro para conciliar neste lado.'}</td></tr>`;
  }
  const tIxc = soma(pendentes('ixc')), tExt = soma(pendentes('ext')), dif = tIxc - tExt;
  $('#t-sel-ixc').value = st.na ? dinheiro(st.sa) : '';
  $('#t-sel-ext').value = st.nb ? dinheiro(st.sb) : '';
  $('#t-conc-ixc').value = dinheiro(tIxc);
  $('#t-conc-ext').value = dinheiro(tExt);
  const elDif = $('#t-dif');
  elDif.value = dinheiro(dif);
  elDif.className = 'entrada ' + (dif === 0 ? 'ok' : 'erro');
  const elSel = $('#t-dif-sel');
  if (st.na || st.nb) { elSel.value = dinheiro(st.sa - st.sb); elSel.className = 'entrada ' + (st.ok ? 'ok' : 'erro'); }
  else { elSel.value = ''; elSel.className = 'entrada'; }
  $('#btn-conciliar').hidden = !st.ok;
  $('#btn-conciliar').textContent = st.ok && selecaoEhDosPares() && S.pares.length > 1 ? `Conciliar ${S.pares.length} pares` : 'Conciliar';
  $('#dica').textContent = st.ok
    ? 'Valores de acordo. Clique em Conciliar para vincular as linhas selecionadas.'
    : st.na || st.nb
      ? 'Valores em desacordo. Ajuste a seleção até os dois lados terem o mesmo total.'
      : 'Selecione títulos dos dois lados até a cor ficar verde. O botão Conciliar aparece quando os valores baterem.';
  const nI = pendentes('ixc').length, nE = pendentes('ext').length;
  $('#ia-corpo').innerHTML = nI + nE
    ? `A integração com o Claude ainda não está conectada. Quando estiver, a IA vai receber só o que sobrou sem par
       (<b>${nI}</b> linha(s) do IXC e <b>${nE}</b> do extrato, sem nomes de clientes), os totais já calculados e o contexto das regras.
       Ela sugere a causa provável, mas nada é conciliado sem você aprovar.`
    : 'Não há divergências pendentes nesta conciliação.';
}

function desenharAuto() {
  for (const lado of ['ixc', 'ext']) {
    const l = linhas(lado).filter((r) => r.conciliado);
    $(`#qa-${lado}`).textContent = `${l.length} conciliado(s)`;
    $(`#ba-${lado}`).innerHTML = l.length
      ? l.map((r) => linhaHTML(r, { conc: true })).join('')
      : '<tr><td colspan="8" class="vazio">Nenhuma linha veio conciliada do IXC.</td></tr>';
  }
}

function desenharTodos() {
  const v = S.c.vinculos;
  $('#q-vinc').textContent = `${v.length}`;
  $('#g-vinc').innerHTML = v.length
    ? v.map((x, i) => `<tr>
        <td>${i + 1}</td>
        <td>${x.ixc_ids.map(esc).join(', ')}</td>
        <td>${x.ixc_ids.map((i2) => esc(porId('ixc', i2)?.documento || '')).join(', ')}</td>
        <td>${x.ext_ids.map(esc).join(', ')}</td>
        <td>${x.ext_ids.map((i2) => esc(porId('ext', i2)?.tx_id || '')).join(', ')}</td>
        <td class="d">${dinheiro(x.valor_centavos)}</td>
        <td>${esc(x.usuario)}</td>
        <td>${dataHoraBR(x.criado_em)}</td>
        <td><button class="btn pq perigo" type="button" data-desfazer="${x.id}">Desfazer</button></td>
      </tr>`).join('')
    : '<tr><td colspan="9" class="vazio">Nenhum vínculo feito ainda. Use a aba Conciliação Manual.</td></tr>';
}

function capturadoEm(v) {
  if (!v) return 'Não informado';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return dataBR(v); // só a data: evita mostrar o dia anterior por causa do fuso
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? esc(v) : esc(d.toLocaleString('pt-BR'));
}

function desenharFiltros() {
  const c = S.c, r = c.resumo;
  const av = $('#avisos');
  av.hidden = !c.avisos.length;
  av.innerHTML = c.avisos.length ? `<b>Avisos da importação:</b><ul>${c.avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : '';
  const campos = [
    ['Conta bancária', esc(c.conta)],
    ['Período', `${dataBR(c.data_inicial)} a ${dataBR(c.data_final)}`],
    ['Francesinha', c.francesinha_nome ? `<a href="/api/conciliacoes/${c.id}/francesinha">${esc(c.francesinha_nome)}</a>` : 'Não enviada'],
    ['Capturado no IXC em', capturadoEm(c.dados.capturado_em)],
    ...(c.dados.origem?.lote_id ? [['Lote / arquivo OFX', `${esc(c.dados.origem.lote_id)} · ${esc(c.dados.origem.arquivo_ofx || '–')}`]] : []),
    ['Criada por', `${esc(c.criado_por)} em ${dataHoraBR(c.criado_em)}`],
    ['Observação', c.observacao ? esc(c.observacao).replace(/\n/g, '<br>') : '–'],
  ];
  $('#dados-filtros').innerHTML = campos.map(([t, v]) => `<dt>${t}</dt><dd>${v}</dd>`).join('');
  $('#metricas').innerHTML = [
    ['Linhas na Movimentação', r.linhas_ixc], ['Linhas no Extrato', r.linhas_ext],
    ['Pendentes no IXC', r.pendentes_ixc], ['Pendentes no extrato', r.pendentes_ext],
    ['Total a conciliar (IXC)', dinheiro(r.total_a_conciliar_ixc)], ['Total a conciliar (extrato)', dinheiro(r.total_a_conciliar_ext)],
    ['Diferença', dinheiro(r.diferenca)], ['Vínculos feitos aqui', r.vinculos],
  ].map(([t, n]) => `<div class="metrica"><span>${t}</span><b>${n}</b></div>`).join('');
}

function desenharCabecalho() {
  const c = S.c, r = c.resumo;
  const nPend = r.pendentes_ixc + r.pendentes_ext;
  $('#subtitulo').textContent = `· ${c.conta} · ${dataBR(c.data_inicial)} a ${dataBR(c.data_final)}`;
  $('#situacao').innerHTML = r.diferenca === 0 && !nPend
    ? '<span class="etiqueta fechada">Sem diferença</span>'
    : `<span class="etiqueta aberta">Diferença ${dinheiro(r.diferenca)}</span>`;
  $('#etapas').innerHTML = ABAS.map(([k, t]) => {
    const cont = k === 'manual' ? nPend : k === 'todos' ? r.vinculos : k === 'auto' ? linhas('ixc').filter((x) => x.conciliado).length : 0;
    return `<button class="etapa${S.aba === k ? ' ativa' : ''}" type="button" data-aba="${k}">${t}${cont ? `<span class="cont">${cont}</span>` : ''}</button>`;
  }).join('');
  const i = ABAS.findIndex((a) => a[0] === S.aba);
  $('#btn-ant').disabled = i === 0;
  $('#btn-prox').disabled = i === ABAS.length - 1;
}

function desenhar() {
  for (const [k] of ABAS) $(`#aba-${k}`).hidden = S.aba !== k;
  desenharCabecalho();
  ({ filtros: desenharFiltros, auto: desenharAuto, manual: desenharManual, todos: desenharTodos })[S.aba]();
}

async function recarregar() {
  S.c = await api(`/api/conciliacoes/${id}`);
  // Remove da seleção o que não estiver mais pendente.
  for (const lado of ['ixc', 'ext']) {
    const p = new Set(pendentes(lado).map((r) => r.id));
    S.sel[lado] = new Set([...S.sel[lado]].filter((x) => p.has(x)));
  }
  desenhar();
}

// ---------- eventos ----------
$('#etapas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-aba]');
  if (b) { S.aba = b.dataset.aba; desenhar(); }
});
const mover = (d) => { const i = ABAS.findIndex((a) => a[0] === S.aba) + d; if (ABAS[i]) { S.aba = ABAS[i][0]; desenhar(); } };
$('#btn-ant').addEventListener('click', () => mover(-1));
$('#btn-prox').addEventListener('click', () => mover(1));

for (const lado of ['ixc', 'ext']) {
  $(`#ha-${lado}`).innerHTML = cabecalho(false);
  // Clique no cabeçalho: maior → menor, depois menor → maior, depois ordem original.
  $(`#h-${lado}`).addEventListener('click', (e) => {
    const th = e.target.closest('[data-ordem]');
    if (!th) return;
    const campo = th.dataset.ordem, o = S.ordem[lado];
    S.ordem[lado] = !o || o.campo !== campo ? { campo, dir: -1 } : o.dir < 0 ? { campo, dir: 1 } : null;
    desenharManual();
  });
  $(`#f-${lado}`).innerHTML = CAMPOS_BUSCA.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
  $(`#f-${lado}`).addEventListener('change', (e) => { S.busca[lado].campo = e.target.value; desenharManual(); });
  $(`#b-${lado}`).addEventListener('input', (e) => { S.busca[lado].q = e.target.value; desenharManual(); });
  $(`#g-${lado}`).addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const s = S.sel[lado], rid = tr.dataset.id;
    s.has(rid) ? s.delete(rid) : s.add(rid);
    desenharManual();
  });
}

$('#btn-iguais').addEventListener('click', () => {
  S.valorEscolhido = '';
  aplicarPares(montarPares());
  desenharManual();
  if (S.pares) aviso(`${S.pares.length} par(es) de valores iguais selecionados`);
});
$('#sel-valor').addEventListener('change', (e) => {
  S.valorEscolhido = e.target.value;
  if (!S.valorEscolhido) { S.pares = null; S.sel.ixc.clear(); S.sel.ext.clear(); }
  else aplicarPares(montarPares(Number(S.valorEscolhido)));
  desenharManual();
});
$('#btn-limpar').addEventListener('click', () => {
  S.pares = null; S.valorEscolhido = '';
  S.sel.ixc.clear(); S.sel.ext.clear();
  desenharManual();
});

$('#btn-conciliar').addEventListener('click', async () => {
  const st = estadoSelecao();
  if (!st.ok) return;
  const b = $('#btn-conciliar');
  b.disabled = true;
  try {
    if (selecaoEhDosPares() && S.pares.length > 1) {
      const n = S.pares.length;
      await api(`/api/conciliacoes/${id}/vinculos/lote`, { metodo: 'POST', corpo: { pares: S.pares.map(({ ixc, ext }) => ({ ixc, ext })) } });
      aviso(`${n} pares vinculados: ${dinheiro(st.sa)} (veja em Todos os conciliados)`);
    } else {
      await api(`/api/conciliacoes/${id}/vinculos`, { metodo: 'POST', corpo: { ixc: [...S.sel.ixc], ext: [...S.sel.ext] } });
      aviso(`Vinculado: ${dinheiro(st.sa)} (veja em Todos os conciliados)`);
    }
    S.sel.ixc.clear(); S.sel.ext.clear();
    S.pares = null; S.valorEscolhido = '';
    await recarregar();
  } catch (err) { aviso(err.message, 'erro'); }
  finally { b.disabled = false; }
});

$('#g-vinc').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-desfazer]');
  if (!b) return;
  try {
    await api(`/api/conciliacoes/${id}/vinculos/${b.dataset.desfazer}`, { metodo: 'DELETE' });
    await recarregar();
    aviso('Vínculo desfeito. As linhas voltaram para a Conciliação Manual.');
  } catch (err) { aviso(err.message, 'erro'); }
});

// ---------- início ----------
await iniciarTopo([['Conciliações', '/'], [id ? `#${id}` : 'Conciliação']]);
try {
  if (!id) throw new Error('Conciliação não informada.');
  await recarregar();
  $('#janela').hidden = false;
  if (S.c.francesinha_nome) {
    const a = $('#btn-francesinha');
    a.href = `/api/conciliacoes/${id}/francesinha`;
    a.hidden = false;
  }
  document.title = `#${id} ${S.c.conta} · Concilia IA`;
} catch (err) {
  const e = $('#erro-geral');
  e.innerHTML = `${esc(err.message)} <a href="/">Voltar à lista</a>`;
  e.hidden = false;
}


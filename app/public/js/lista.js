import { $, api, esc, dinheiro, dataBR, dataHoraBR, iniciarTopo, aviso } from './comum.js';

let todas = [];

function situacao(c) {
  return c.resumo.diferenca === 0 && c.resumo.pendentes_ixc + c.resumo.pendentes_ext === 0 ? 'fechada' : 'aberta';
}

function desenhar() {
  const s = $('#f-situacao').value;
  const q = $('#f-busca').value.trim().toLowerCase();
  const lista = todas.filter((c) => {
    if (s && situacao(c) !== s) return false;
    if (!q) return true;
    return [c.conta, dataBR(c.data_inicial), dataBR(c.data_final), c.criado_por, c.observacao, String(c.id)]
      .some((v) => String(v || '').toLowerCase().includes(q));
  });
  $('#contagem').textContent = `${lista.length} de ${todas.length}`;
  const tb = $('#linhas');
  if (!todas.length) {
    tb.innerHTML = '<tr><td colspan="11" class="vazio">Nenhuma conciliação ainda. Clique em <b>+ Nova conciliação</b> e envie o JSON extraído do IXC.</td></tr>';
    return;
  }
  if (!lista.length) {
    tb.innerHTML = '<tr><td colspan="11" class="vazio">Nada encontrado com esses filtros.</td></tr>';
    return;
  }
  tb.innerHTML = lista.map((c) => {
    const r = c.resumo, st = situacao(c);
    return `<tr class="clicavel" data-id="${c.id}">
      <td>${c.id}</td>
      <td>${esc(c.conta)}${c.avisos ? ` <span class="etiqueta aberta" title="Avisos na importação">${c.avisos} aviso(s)</span>` : ''}</td>
      <td>${dataBR(c.data_inicial)} a ${dataBR(c.data_final)}</td>
      <td class="c"><span class="etiqueta ${st}">${st === 'fechada' ? 'Sem diferença' : 'Com diferença'}</span></td>
      <td class="d">${r.pendentes_ixc}</td>
      <td class="d">${r.pendentes_ext}</td>
      <td class="d ${r.diferenca ? 'negativo' : ''}">${dinheiro(r.diferenca)}</td>
      <td class="c">${c.francesinha_nome ? '<span class="ic-sim" title="' + esc(c.francesinha_nome) + '">✓</span>' : '–'}</td>
      <td>${esc(c.criado_por)}</td>
      <td>${dataHoraBR(c.atualizado_em)}</td>
      <td><button class="btn pq perigo" data-excluir="${c.id}" type="button">Excluir</button></td>
    </tr>`;
  }).join('');
}

$('#linhas').addEventListener('click', async (e) => {
  const ex = e.target.closest('[data-excluir]');
  if (ex) {
    e.stopPropagation();
    const c = todas.find((x) => x.id === Number(ex.dataset.excluir));
    if (!confirm(`Excluir a conciliação #${c.id} (${c.conta})? Os vínculos feitos aqui e a francesinha também serão apagados.`)) return;
    try {
      await api(`/api/conciliacoes/${c.id}`, { metodo: 'DELETE' });
      todas = todas.filter((x) => x.id !== c.id);
      desenhar();
      aviso('Conciliação excluída');
    } catch (err) { aviso(err.message, 'erro'); }
    return;
  }
  const tr = e.target.closest('tr[data-id]');
  if (tr) location.href = `/conciliacao.html?id=${tr.dataset.id}`;
});
$('#f-situacao').addEventListener('change', desenhar);
$('#f-busca').addEventListener('input', desenhar);

await iniciarTopo([['Conciliações']]);
try {
  todas = await api('/api/conciliacoes');
  desenhar();
} catch (err) {
  $('#linhas').innerHTML = `<tr><td colspan="11" class="vazio">${esc(err.message)}</td></tr>`;
}

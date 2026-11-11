import { $, api, esc, dinheiro, iniciarTopo, lerArquivo } from './comum.js';

await iniciarTopo([['Conciliações', '/'], ['Nova conciliação']]);

const estado = { dados: null, francesinha: null };
const erro = $('#erro');
const mostrarErro = (m) => { erro.textContent = m; erro.hidden = !m; if (m) erro.scrollIntoView({ block: 'nearest' }); };
const kb = (n) => (n < 1024 * 1024 ? `${Math.ceil(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

function ligarZona(zona, input, aoEscolher) {
  input.addEventListener('change', () => input.files[0] && aoEscolher(input.files[0]));
  ['dragenter', 'dragover'].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add('arrastando'); }));
  ['dragleave', 'drop'].forEach((ev) => zona.addEventListener(ev, () => zona.classList.remove('arrastando')));
  zona.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) aoEscolher(f); });
}

// ---------- JSON do IXC ----------
async function escolherJSON(arquivo) {
  const zona = $('#zona-json');
  zona.classList.remove('carregado', 'invalido');
  $('#previa').hidden = true;
  estado.dados = null;
  mostrarErro('');
  $('#json-titulo').textContent = arquivo.name;
  $('#json-desc').textContent = 'Validando…';
  try {
    let bruto;
    try { bruto = JSON.parse(await lerArquivo(arquivo)); } catch { throw new Error('O arquivo não é um JSON válido.'); }
    const v = await api('/api/conciliacoes/validar', { metodo: 'POST', corpo: { dados: bruto } });
    estado.dados = bruto;
    zona.classList.add('carregado');
    $('#json-desc').textContent = `${kb(arquivo.size)} · clique para trocar`;
    const r = v.resumo;
    $('#metricas').innerHTML = [
      ['Linhas na Movimentação', r.linhas_ixc], ['Pendentes no IXC', r.pendentes_ixc],
      ['Linhas no Extrato', r.linhas_ext], ['Pendentes no extrato', r.pendentes_ext],
      ['Total a conciliar (IXC)', dinheiro(r.total_a_conciliar_ixc)], ['Total a conciliar (extrato)', dinheiro(r.total_a_conciliar_ext)],
      ['Diferença', dinheiro(r.diferenca)],
    ].map(([t, n]) => `<div class="metrica"><span>${t}</span><b>${n}</b></div>`).join('');
    const av = $('#avisos-json');
    av.hidden = !v.avisos.length;
    av.innerHTML = v.avisos.length ? `<b>Confira antes de salvar:</b><ul>${v.avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : '';
    $('#previa').hidden = false;
    // Preenche com o que veio da aba Filtros do IXC, sem apagar o que já foi digitado.
    if (v.sugestao.conta && !$('#conta').value) $('#conta').value = v.sugestao.conta;
    if (v.sugestao.data_inicial && !$('#data-ini').value) $('#data-ini').value = v.sugestao.data_inicial;
    if (v.sugestao.data_final && !$('#data-fim').value) $('#data-fim').value = v.sugestao.data_final;
  } catch (err) {
    zona.classList.add('invalido');
    $('#json-desc').textContent = err.message;
    $('#arq-json').value = '';
  }
}
ligarZona($('#zona-json'), $('#arq-json'), escolherJSON);

// ---------- francesinha ----------
const TIPOS = ['.pdf', '.csv', '.txt', '.ret', '.xls', '.xlsx', '.ofx'];
async function escolherFrancesinha(arquivo) {
  const zona = $('#zona-fr');
  zona.classList.remove('carregado', 'invalido');
  estado.francesinha = null;
  const ext = arquivo.name.slice(arquivo.name.lastIndexOf('.')).toLowerCase();
  if (!TIPOS.includes(ext) || arquivo.size > 10 * 1024 * 1024 || !arquivo.size) {
    zona.classList.add('invalido');
    $('#fr-titulo').textContent = arquivo.name;
    $('#fr-desc').textContent = !TIPOS.includes(ext) ? 'Tipo de arquivo não aceito.' : 'O arquivo precisa ter entre 1 byte e 10 MB.';
    $('#fr-acoes').hidden = true;
    return;
  }
  const url = await lerArquivo(arquivo, 'base64');
  estado.francesinha = { nome: arquivo.name, tipo: arquivo.type, base64: url.slice(url.indexOf(',') + 1) };
  zona.classList.add('carregado');
  $('#fr-titulo').textContent = arquivo.name;
  $('#fr-desc').textContent = `${kb(arquivo.size)} · clique para trocar`;
  $('#fr-acoes').hidden = false;
}
ligarZona($('#zona-fr'), $('#arq-fr'), escolherFrancesinha);
$('#fr-remover').addEventListener('click', () => {
  estado.francesinha = null;
  $('#arq-fr').value = '';
  $('#zona-fr').classList.remove('carregado', 'invalido');
  $('#fr-titulo').textContent = 'Clique ou arraste a francesinha do banco';
  $('#fr-desc').textContent = 'Relatório de títulos liquidados do banco: PDF, CSV, TXT, RET, XLS ou XLSX, até 10 MB.';
  $('#fr-acoes').hidden = true;
});

// ---------- envio ----------
$('#form').addEventListener('submit', async (e) => {
  e.preventDefault();
  mostrarErro('');
  const conta = $('#conta').value.trim();
  const ini = $('#data-ini').value, fim = $('#data-fim').value;
  if (!estado.dados) return mostrarErro('Envie o arquivo JSON extraído do IXC.');
  if (!conta) return mostrarErro('Informe a conta bancária.');
  if (!ini || !fim) return mostrarErro('Informe o período (data inicial e final).');
  if (ini > fim) return mostrarErro('A data inicial é depois da data final.');
  const b = $('#salvar');
  b.disabled = true; b.textContent = 'Salvando…';
  try {
    const r = await api('/api/conciliacoes', {
      metodo: 'POST',
      corpo: { conta, data_inicial: ini, data_final: fim, observacao: $('#obs').value.trim(), dados: estado.dados, francesinha: estado.francesinha },
    });
    location.href = `/conciliacao.html?id=${r.id}`;
  } catch (err) {
    mostrarErro(err.message);
    b.disabled = false; b.textContent = 'Salvar e abrir';
  }
});

const $ = (id) => document.getElementById(id);

async function abaAtual() {
  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  return aba;
}

function origemCadastrada(url, enderecos) {
  if (/^file:/i.test(url)) return enderecos.includes('file://');
  try { const o = new URL(url).origin; return enderecos.some((e) => e.replace(/\/+$/, '') === o); } catch (e) { return false; }
}

async function atualizar() {
  const c = await chrome.storage.local.get({ ativo: true, visualModerno: true, enderecos: [] });
  $('ativo').checked = c.ativo;
  $('visual').checked = c.visualModerno;
  $('visual').disabled = !c.ativo;
  $('ativo-txt').textContent = c.ativo ? 'Painel aparece na Conciliação do IXC' : 'Desligada: não lê nada em nenhuma aba';
  const aba = await abaAtual();
  const st = $('status'), botao = $('abrir');
  botao.disabled = true;
  if (!c.enderecos.length) { st.innerHTML = '<span class="nok">Nenhum endereço do IXC cadastrado.</span> Cadastre em Configurações.'; return; }
  if (!aba || !origemCadastrada(aba.url || '', c.enderecos)) {
    st.innerHTML = '<span class="suave">Esta aba não é o IXC. A Lolla só funciona nos endereços cadastrados.</span>';
    return;
  }
  if (!c.ativo) { st.innerHTML = '<span class="suave">Esta aba é o IXC. Ligue a Lolla para usar.</span>'; return; }
  chrome.tabs.sendMessage(aba.id, { tipo: 'na-conciliacao' }, (r) => {
    if (chrome.runtime.lastError || !r) {
      st.innerHTML = 'Esta aba é o IXC. <span class="suave">Abra Financeiro → Conciliação bancária → Conciliação Manual. Se acabou de instalar, recarregue a página (F5).</span>';
      return;
    }
    st.innerHTML = '<span class="ok">✓ Conciliação Manual encontrada nesta aba.</span>';
    botao.disabled = false;
  });
}

$('ativo').addEventListener('change', async (e) => { await chrome.storage.local.set({ ativo: e.target.checked }); setTimeout(atualizar, 300); });
$('visual').addEventListener('change', (e) => chrome.storage.local.set({ visualModerno: e.target.checked }));
$('abrir').addEventListener('click', async () => {
  const aba = await abaAtual();
  chrome.tabs.sendMessage(aba.id, { tipo: 'abrir-painel' }, () => window.close());
});
$('opcoes').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
atualizar();

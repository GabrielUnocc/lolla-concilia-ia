const $ = (id) => document.getElementById(id);
const PADRAO = { enderecos: [], apiKey: '', workspaceId: '', modelo: 'claude-sonnet-5-5', iaSimulada: false, servidorLolla: '' };

function mensagem(id, texto, tipo) { const el = $(id); el.textContent = texto; el.className = 'msg ' + (tipo || ''); }

async function carregar() {
  const c = await chrome.storage.local.get(PADRAO);
  $('servidor-lolla').value = c.servidorLolla;
  $('editar-contextos').disabled = !c.servidorLolla;
  $('chave').value = c.apiKey; $('workspace').value = c.workspaceId; $('modelo').value = c.modelo; $('simulada').checked = c.iaSimulada;
  const lista = $('enderecos');
  lista.innerHTML = '';
  if (!c.enderecos.length) lista.innerHTML = '<li class="suave">Nenhum endereço ainda.</li>';
  c.enderecos.forEach((e) => {
    const li = document.createElement('li');
    const code = document.createElement('code'); code.textContent = e;
    const b = document.createElement('button'); b.textContent = 'Remover';
    b.addEventListener('click', () => remover(e));
    li.append(code, b); lista.appendChild(li);
  });
}

async function adicionar() {
  let origem;
  const bruto = $('novo-endereco').value.trim();
  if (/^file:/i.test(bruto)) origem = 'file://'; // página de teste aberta direto do computador
  else {
    try { origem = new URL(/^https?:\/\//i.test(bruto) ? bruto : 'https://' + bruto).origin; }
    catch (e) { return mensagem('msg-endereco', 'Endereço inválido. Ex.: https://teste.seuprovedor.com.br', 'erro'); }
  }
  // O Chrome pede a sua confirmação para a Lolla acessar só este endereço
  const ok = await chrome.permissions.request({ origins: [origem + '/*'] });
  if (!ok) return mensagem('msg-endereco', 'Permissão não concedida. A Lolla não vai rodar nesse endereço.', 'erro');
  const c = await chrome.storage.local.get(PADRAO);
  if (!c.enderecos.includes(origem)) c.enderecos.push(origem);
  await chrome.storage.local.set({ enderecos: c.enderecos });
  await chrome.runtime.sendMessage({ tipo: 'sincronizar' });
  $('novo-endereco').value = '';
  mensagem('msg-endereco', `Pronto: a Lolla vai rodar em ${origem}. Se o IXC já estava aberto, recarregue a página (F5).`, 'ok');
  carregar();
}

async function remover(origem) {
  const c = await chrome.storage.local.get(PADRAO);
  await chrome.storage.local.set({ enderecos: c.enderecos.filter((e) => e !== origem) });
  try { await chrome.permissions.remove({ origins: [origem + '/*'] }); } catch (e) { /* ok */ }
  await chrome.runtime.sendMessage({ tipo: 'sincronizar' });
  mensagem('msg-endereco', 'Endereço removido.', 'ok');
  carregar();
}

async function salvar() {
  await chrome.storage.local.set({
    apiKey: $('chave').value.trim(), workspaceId: $('workspace').value.trim(), modelo: $('modelo').value, iaSimulada: $('simulada').checked
  });
  mensagem('msg-api', 'Salvo.', 'ok');
}

async function testar() {
  await salvar();
  mensagem('msg-api', 'Testando…');
  const r = await chrome.runtime.sendMessage({ tipo: 'testar' });
  mensagem('msg-api', r && r.ok ? 'Conectado: ' + r.modelo : 'Falhou: ' + ((r && r.erro) || 'sem resposta'), r && r.ok ? 'ok' : 'erro');
}

// Servidor da Lolla: guarda o endereço, pede a permissão do Chrome só para ele e testa a leitura dos contextos
async function testarServidor() {
  const r = await chrome.runtime.sendMessage({ tipo: 'contextos' });
  if (!r || !r.ok) return mensagem('msg-servidor', 'Falhou: ' + ((r && r.erro) || 'sem resposta'), 'erro');
  if (r.aviso) return mensagem('msg-servidor', r.aviso, 'erro');
  mensagem('msg-servidor', `Conectado. ${r.contextos.length} contexto(s) vão junto em cada análise${r.contextos.length ? ': ' + r.contextos.map((c) => c.titulo).join(', ') : ''}.`, 'ok');
}
async function conectarServidor() {
  let origem;
  try {
    const bruto = $('servidor-lolla').value.trim() || 'http://127.0.0.1:3000';
    origem = new URL(/^https?:\/\//i.test(bruto) ? bruto : 'http://' + bruto).origin;
  } catch (e) { return mensagem('msg-servidor', 'Endereço inválido. Ex.: http://127.0.0.1:3000', 'erro'); }
  const ok = await chrome.permissions.request({ origins: [origem + '/*'] });
  if (!ok) return mensagem('msg-servidor', 'Permissão não concedida. A Lolla não vai buscar os contextos.', 'erro');
  await chrome.storage.local.set({ servidorLolla: origem });
  $('servidor-lolla').value = origem;
  $('editar-contextos').disabled = false;
  mensagem('msg-servidor', 'Testando…');
  testarServidor();
}
async function removerServidor() {
  const { servidorLolla, enderecos } = await chrome.storage.local.get(PADRAO);
  await chrome.storage.local.set({ servidorLolla: '' });
  // Só devolve a permissão se o mesmo endereço não for também um IXC cadastrado
  if (servidorLolla && !enderecos.includes(servidorLolla)) { try { await chrome.permissions.remove({ origins: [servidorLolla + '/*'] }); } catch (e) { /* ok */ } }
  $('servidor-lolla').value = '';
  $('editar-contextos').disabled = true;
  mensagem('msg-servidor', 'A análise não vai mais usar o Contexto da IA.', 'ok');
}
async function abrirContextos() {
  const { servidorLolla } = await chrome.storage.local.get(PADRAO);
  if (servidorLolla) chrome.tabs.create({ url: servidorLolla + '/#contexto' });
}

$('conectar-servidor').addEventListener('click', conectarServidor);
$('servidor-lolla').addEventListener('keydown', (e) => { if (e.key === 'Enter') conectarServidor(); });
$('remover-servidor').addEventListener('click', removerServidor);
$('editar-contextos').addEventListener('click', abrirContextos);
$('adicionar').addEventListener('click', adicionar);
$('novo-endereco').addEventListener('keydown', (e) => { if (e.key === 'Enter') adicionar(); });
$('salvar').addEventListener('click', salvar);
$('testar').addEventListener('click', testar);
carregar();

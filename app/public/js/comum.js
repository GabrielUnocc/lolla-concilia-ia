// Funções compartilhadas entre as telas.
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** centavos -> "1.234,56" */
export const dinheiro = (c) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** "2026-11-02" -> "02/11/2026" */
export const dataBR = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
/** "2026-11-04 13:05:00" (UTC do SQLite) -> "04/11/2026 10:05" no fuso local */
export const dataHoraBR = (s) => {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

export async function api(caminho, { metodo = 'GET', corpo } = {}) {
  const r = await fetch(caminho, {
    method: metodo,
    headers: corpo !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    credentials: 'same-origin',
  });
  if (r.status === 401 && !caminho.endsWith('/login')) {
    location.href = '/login.html?volta=' + encodeURIComponent(location.pathname + location.search);
    throw new Error('Sessão expirada');
  }
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.erro || `Erro ${r.status}`);
  return json;
}

let tempoToast;
export function aviso(texto, tipo = '') {
  let el = $('#aviso-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'aviso-toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.className = 'aviso-toast on ' + tipo;
  el.textContent = texto;
  clearTimeout(tempoToast);
  tempoToast = setTimeout(() => el.classList.remove('on'), 3200);
}

/** Preenche o topo com o nome do usuário e liga o botão Sair. */
export async function iniciarTopo(trilha = []) {
  const usuario = await api('/api/me');
  $('#trilha').innerHTML = trilha.map(([t, h]) => (h ? `<a href="${h}">${esc(t)}</a>` : esc(t))).join(' &rsaquo; ');
  $('#usuario-nome').textContent = usuario.nome;
  $('#btn-sair').addEventListener('click', async () => {
    await api('/api/logout', { metodo: 'POST', corpo: {} }).catch(() => {});
    location.href = '/login.html';
  });
  return usuario;
}

export function lerArquivo(arquivo, como = 'texto') {
  return new Promise((ok, falha) => {
    const fr = new FileReader();
    fr.onload = () => ok(fr.result);
    fr.onerror = () => falha(fr.error);
    if (como === 'base64') fr.readAsDataURL(arquivo); else fr.readAsText(arquivo, 'utf-8');
  });
}

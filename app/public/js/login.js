import { $, api } from './comum.js';

const form = $('#form-login');
const erro = $('#erro');
const botao = $('#entrar');

// Só aceita voltar para uma página deste mesmo site.
function destino() {
  const v = new URLSearchParams(location.search).get('volta') || '/';
  return v.startsWith('/') && !v.startsWith('//') ? v : '/';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  erro.hidden = true;
  const email = $('#email').value.trim();
  const senha = $('#senha').value;
  if (!email || !senha) {
    erro.textContent = 'Informe e-mail e senha.';
    erro.hidden = false;
    return;
  }
  botao.disabled = true;
  botao.textContent = 'Entrando…';
  try {
    await api('/api/login', { metodo: 'POST', corpo: { email, senha } });
    location.href = destino();
  } catch (err) {
    erro.textContent = err.message;
    erro.hidden = false;
    $('#senha').select();
  } finally {
    botao.disabled = false;
    botao.textContent = 'Entrar';
  }
});

/*
 * Criptografia (Web Crypto API).
 * Senha local -> chave AES-GCM 256 via PBKDF2 (SHA-256, 250 mil iterações).
 * A chave derivada só existe em memória durante a sessão.
 */
Lolla.services.cripto = (function () {
  const ITERACOES = 250000;
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let chave = null;

  const paraB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  function disponivel() {
    return !!(window.crypto && window.crypto.subtle);
  }

  function novoSal() {
    return paraB64(crypto.getRandomValues(new Uint8Array(16)));
  }

  async function derivar(senha, salB64) {
    const material = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveKey']);
    chave = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: deB64(salB64), iterations: ITERACOES, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function cifrar(valor) {
    if (!chave) throw new Error('Sessão bloqueada.');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, enc.encode(JSON.stringify(valor)));
    return { iv: paraB64(iv), ct: paraB64(ct) };
  }

  async function decifrar(pacote) {
    if (!chave) throw new Error('Sessão bloqueada.');
    const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(pacote.iv) }, chave, deB64(pacote.ct));
    return JSON.parse(dec.decode(claro));
  }

  return {
    disponivel,
    novoSal,
    derivar,
    cifrar,
    decifrar,
    bloquear: () => { chave = null; },
    temChave: () => !!chave
  };
})();

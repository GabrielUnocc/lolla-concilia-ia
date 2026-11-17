/*
 * Gerenciamento e persistência de dados (localStorage).
 * - publico: preferências sem dado sensível, em texto claro.
 * - seguro:  base simulada, histórico de análises e uso da IA, sempre cifrados.
 * Trocar localStorage por IndexedDB ou um backend no futuro = mudar só este arquivo.
 */
Lolla.services.armazenamento = (function () {
  const PREFIXO = 'lolla:';
  const VERIFICADOR = 'lolla-ok';
  const BANCO_ARQUIVOS = 'lolla-arquivos';
  const cripto = Lolla.services.cripto;

  function ler(k) {
    try { const v = localStorage.getItem(PREFIXO + k); return v == null ? null : JSON.parse(v); } catch (e) { return null; }
  }
  function gravar(k, v) {
    try { localStorage.setItem(PREFIXO + k, JSON.stringify(v)); return true; } catch (e) { return false; }
  }
  function remover(k) {
    try { localStorage.removeItem(PREFIXO + k); } catch (e) { /* ignora */ }
  }

  const publico = { ler, gravar, remover };

  /* Cofre: senha local que libera os dados cifrados */
  const cofre = {
    existe: () => !!ler('cofre'),

    async criar(senha) {
      const sal = cripto.novoSal();
      await cripto.derivar(senha, sal);
      gravar('cofre', { sal, verificador: await cripto.cifrar(VERIFICADOR) });
    },

    async abrir(senha) {
      const c = ler('cofre');
      if (!c) throw new Error('Cofre não encontrado.');
      await cripto.derivar(senha, c.sal);
      try {
        if ((await cripto.decifrar(c.verificador)) !== VERIFICADOR) throw new Error();
      } catch (e) {
        cripto.bloquear();
        throw new Error('Senha incorreta.');
      }
    },

    bloquear: () => cripto.bloquear(),

    apagarTudo() {
      try {
        Object.keys(localStorage).filter((k) => k.startsWith(PREFIXO)).forEach((k) => localStorage.removeItem(k));
      } catch (e) { /* ignora */ }
      try { indexedDB.deleteDatabase(BANCO_ARQUIVOS); } catch (e) { /* ignora */ }
      cripto.bloquear();
    }
  };

  const seguro = {
    async ler(k) {
      const pacote = ler('seg:' + k);
      return pacote ? cripto.decifrar(pacote) : null;
    },
    async gravar(k, v) {
      gravar('seg:' + k, await cripto.cifrar(v));
    },
    remover: (k) => remover('seg:' + k)
  };

  /* Arquivos (ex.: francesinha): IndexedDB, porque o localStorage tem poucos MB. Sempre cifrados. */
  const abrirBanco = () => new Promise((ok, falha) => {
    const r = indexedDB.open(BANCO_ARQUIVOS, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('arquivos');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(new Error('Não consegui abrir o armazenamento de arquivos do navegador.'));
  });
  const operar = async (modo, fn) => {
    const banco = await abrirBanco();
    return new Promise((ok, falha) => {
      const tx = banco.transaction('arquivos', modo);
      const pedido = fn(tx.objectStore('arquivos'));
      tx.oncomplete = () => { banco.close(); ok(pedido.result); };
      tx.onerror = () => { banco.close(); falha(new Error('Falha ao gravar o arquivo no navegador (espaço cheio?).')); };
    });
  };
  const arquivos = {
    // valor: { nome, tipo, base64 }
    async gravar(id, valor) { const pacote = await cripto.cifrar(valor); await operar('readwrite', (os) => os.put(pacote, id)); },
    async ler(id) { const pacote = await operar('readonly', (os) => os.get(id)); return pacote ? cripto.decifrar(pacote) : null; },
    remover: (id) => operar('readwrite', (os) => os.delete(id))
  };

  return { publico, seguro, cofre, arquivos };
})();

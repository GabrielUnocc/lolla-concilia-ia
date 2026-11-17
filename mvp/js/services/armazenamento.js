/*
 * Gerenciamento e persistência de dados (localStorage).
 * - publico: preferências sem dado sensível, em texto claro.
 * - seguro:  base simulada, histórico de análises e uso da IA, sempre cifrados.
 * Trocar localStorage por IndexedDB ou um backend no futuro = mudar só este arquivo.
 */
Lolla.services.armazenamento = (function () {
  const PREFIXO = 'lolla:';
  const VERIFICADOR = 'lolla-ok';
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

  return { publico, seguro, cofre };
})();

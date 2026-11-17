/*
 * Extração do texto posicionado de um PDF com o pdf.js (vendor/pdfjs, versão 3.11.174).
 * Devolve [[{x, y, w, str}]] por página — a interpretação (colunas, títulos) fica em domain/analise/leitorFrancesinha.js.
 * Segurança: isEvalSupported:false (mitiga CVE-2024-4367); nada é enviado para fora do navegador.
 * Aberto direto do disco (file://), o navegador não deixa criar o "worker": o pdf.js roda na própria página.
 */
(function (g) {
  const L = g.Lolla;
  L.services = L.services || {};
  let preparado = null;

  function base() {
    const s = document.querySelector('script[src*="pdf.min.js"]');
    return s ? s.src.replace(/pdf\.min\.js.*$/, '') : 'vendor/pdfjs/';
  }

  function carregarScript(src) {
    return new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = () => falha(new Error('Não consegui carregar ' + src));
      document.head.appendChild(s);
    });
  }

  async function preparar() {
    if (!g.pdfjsLib) throw new Error('Leitor de PDF (pdf.js) não carregado. Confira a pasta vendor/pdfjs.');
    if (!preparado) {
      preparado = (async () => {
        if (location.protocol === 'file:') {
          if (!g.pdfjsWorker) await carregarScript(base() + 'pdf.worker.min.js');   // modo sem worker
        } else {
          g.pdfjsLib.GlobalWorkerOptions.workerSrc = base() + 'pdf.worker.min.js';
        }
      })();
    }
    return preparado;
  }

  async function extrair(arquivo, aoProgredir) {
    await preparar();
    const dados = new Uint8Array(await arquivo.arrayBuffer());
    if (!(dados[0] === 0x25 && dados[1] === 0x50 && dados[2] === 0x44 && dados[3] === 0x46)) throw new Error('O arquivo não é um PDF (não começa com %PDF).');
    let doc;
    try {
      doc = await g.pdfjsLib.getDocument({ data: dados, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
    } catch (e) {
      if (e && e.name === 'PasswordException') throw new Error('PDF protegido por senha. Gere a francesinha sem senha.');
      throw new Error('Não consegui abrir o PDF: ' + (e && e.message ? e.message : e));
    }
    const paginas = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const conteudo = await (await doc.getPage(i)).getTextContent();
      paginas.push(conteudo.items.filter((it) => 'str' in it).map((it) => ({ x: it.transform[4], y: it.transform[5], w: it.width, str: it.str })));
      if (aoProgredir) aoProgredir(i, doc.numPages);
    }
    await doc.destroy();
    return paginas;
  }

  L.services.pdfTexto = { extrair };
})(typeof self !== 'undefined' ? self : globalThis);

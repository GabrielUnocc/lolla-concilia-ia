/*
 * Modo Análise — leitura de planilhas sem dependências externas.
 * Formatos: CSV/TXT (separador detectado), XLSX (ZIP + XML), XLS (Excel 97-2003, BIFF8)
 * e "XLS" que na verdade é uma tabela HTML (comum em exportações web).
 * Devolve uma matriz de células (texto ou número) por aba; datas com formato de data viram AAAA-MM-DD.
 * Tudo roda no navegador (ou em Node para os testes); o arquivo não sai do computador.
 *
 * Por que não SheetJS: a versão do npm (0.18.5) tem vulnerabilidades conhecidas
 * (CVE-2023-30533 e CVE-2024-22363) e as versões corrigidas só existem fora do npm.
 */
(function (g) {
  const A = g.Lolla.domain.analise;

  class ErroPlanilha extends Error {}

  /* ---------- Utilitários ---------- */
  function decodificarTexto(bytes) {
    let ini = 0;
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) ini = 3;
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(ini)); }
    catch (e) { return new TextDecoder('windows-1252').decode(bytes.subarray(ini)); }
  }

  const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  const entidades = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENTIDADES[e.toLowerCase()] != null ? ENTIDADES[e.toLowerCase()] : m;
  });

  /* ---------- CSV ---------- */
  function detectarSeparador(texto) {
    const linhas = texto.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
    let melhor = ';', melhorNota = -1;
    [';', ',', '\t', '|'].forEach((sep) => {
      const contagens = linhas.map((l) => { let n = 0, aspas = false; for (const ch of l) { if (ch === '"') aspas = !aspas; else if (ch === sep && !aspas) n++; } return n; });
      const maiores = contagens.filter((n) => n > 0);
      if (!maiores.length) return;
      const moda = maiores.sort((a, b) => maiores.filter((x) => x === b).length - maiores.filter((x) => x === a).length)[0];
      const nota = contagens.filter((n) => n === moda).length * 10 + moda;
      if (nota > melhorNota) { melhorNota = nota; melhor = sep; }
    });
    return melhor;
  }

  function lerCsv(texto) {
    const sep = detectarSeparador(texto);
    const linhas = [];
    let linha = [], campo = '', aspas = false, i = 0;
    const fimCampo = () => { linha.push(campo); campo = ''; };
    const fimLinha = () => { fimCampo(); linhas.push(linha); linha = []; };
    while (i < texto.length) {
      const ch = texto[i];
      if (aspas) {
        if (ch === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false; }
        else campo += ch;
      } else if (ch === '"' && campo === '') aspas = true;
      else if (ch === sep) fimCampo();
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && texto[i + 1] === '\n') i++; fimLinha(); }
      else campo += ch;
      i++;
    }
    if (campo !== '' || linha.length) fimLinha();
    return { separador: sep === '\t' ? 'tab' : sep, linhas: linhas.filter((l) => l.some((c) => String(c).trim() !== '')) };
  }

  /* ---------- HTML (XLS exportado como tabela) ---------- */
  function lerHtml(texto) {
    const tabelas = texto.match(/<table[\s\S]*?<\/table>/gi) || [];
    return tabelas.map((t, k) => {
      const linhas = (t.match(/<tr[\s\S]*?<\/tr>/gi) || []).map((tr) => {
        const cel = [];
        (tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || []).forEach((td) => {
          const span = Number((td.match(/colspan\s*=\s*["']?(\d+)/i) || [])[1] || 1);
          const v = entidades(td.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
          cel.push(v); for (let s = 1; s < span; s++) cel.push('');
        });
        return cel;
      }).filter((l) => l.some((c) => c !== ''));
      return { nome: 'Tabela ' + (k + 1), linhas };
    }).filter((a) => a.linhas.length);
  }

  /* ---------- Formatos de data (XLSX e XLS) ---------- */
  const FORMATOS_DATA_PADRAO = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
  const ehFormatoData = (codigo) => {
    const s = String(codigo || '').replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
    return /[dy]/i.test(s) || (/m/i.test(s) && !/[h0#]/i.test(s) && /[\/\-.]/.test(s));
  };
  const serialParaIso = (n, base1904) => A.norm.dataDeSerialExcel(base1904 ? n + 1462 : n);

  /* ---------- ZIP (para XLSX) ---------- */
  async function inflar(dados) {
    if (typeof DecompressionStream === 'undefined') throw new ErroPlanilha('Este navegador não consegue abrir XLSX (sem DecompressionStream). Use Chrome/Edge atualizados ou exporte em CSV.');
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([dados]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function abrirZip(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) throw new ErroPlanilha('Arquivo XLSX corrompido (estrutura ZIP não encontrada).');
    const qtd = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const entradas = {};
    for (let k = 0; k < qtd; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new ErroPlanilha('Arquivo XLSX corrompido (diretório ZIP).');
      const metodo = dv.getUint16(p + 10, true), tam = dv.getUint32(p + 20, true);
      const nLen = dv.getUint16(p + 28, true), xLen = dv.getUint16(p + 30, true), cLen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const nome = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nLen));
      entradas[nome] = { metodo, tam, local };
      p += 46 + nLen + xLen + cLen;
    }
    async function ler(nome) {
      const e = entradas[nome];
      if (!e) return null;
      const ini = e.local + 30 + dv.getUint16(e.local + 26, true) + dv.getUint16(e.local + 28, true);
      const dados = bytes.subarray(ini, ini + e.tam);
      const bruto = e.metodo === 0 ? dados : e.metodo === 8 ? await inflar(dados) : null;
      if (!bruto) throw new ErroPlanilha('Compressão não suportada no XLSX (método ' + e.metodo + ').');
      return new TextDecoder('utf-8').decode(bruto);
    }
    return { ler, nomes: Object.keys(entradas) };
  }

  const colunaIdx = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, '').toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const atributo = (tag, nome) => { const m = tag.match(new RegExp('\\s' + nome + '="([^"]*)"')); return m ? m[1] : null; };
  const textosT = (xml) => (xml.replace(/<rPh[\s\S]*?<\/rPh>/g, '').match(/<t(?:\s[^>]*)?>[\s\S]*?<\/t>|<t\s*\/>/g) || [])
    .map((t) => entidades(t.replace(/^<t[^>]*>|<\/t>$/g, '').replace(/^<t\s*\/>$/, ''))).join('');

  async function lerXlsx(bytes) {
    const zip = await abrirZip(bytes);
    const wb = await zip.ler('xl/workbook.xml');
    if (!wb) throw new ErroPlanilha('Arquivo XLSX sem workbook.xml.');
    if (/<fileVersion[^>]*\/>/.test(wb) && zip.nomes.includes('EncryptionInfo')) throw new ErroPlanilha('Planilha protegida por senha.');
    const base1904 = /date1904="(1|true)"/.test(wb);
    const rels = (await zip.ler('xl/_rels/workbook.xml.rels')) || '';
    const alvo = {};
    (rels.match(/<Relationship\b[^>]*>/g) || []).forEach((r) => { alvo[atributo(r, 'Id')] = atributo(r, 'Target'); });
    const compart = (await zip.ler('xl/sharedStrings.xml')) || '';
    const strings = (compart.match(/<si>[\s\S]*?<\/si>|<si\s*\/>/g) || []).map(textosT);
    const estilos = (await zip.ler('xl/styles.xml')) || '';
    const formatos = {};
    (estilos.match(/<numFmt\b[^>]*>/g) || []).forEach((f) => { formatos[atributo(f, 'numFmtId')] = entidades(atributo(f, 'formatCode') || ''); });
    const xfs = ((estilos.match(/<cellXfs[\s\S]*?<\/cellXfs>/) || [''])[0].match(/<xf\b[^>]*>/g) || []).map((x) => Number(atributo(x, 'numFmtId') || 0));
    const estiloData = xfs.map((id) => FORMATOS_DATA_PADRAO.has(id) || (formatos[id] != null && ehFormatoData(formatos[id])));

    const abas = [];
    for (const s of wb.match(/<sheet\b[^>]*>/g) || []) {
      const nome = entidades(atributo(s, 'name') || '');
      let caminho = alvo[atributo(s, 'r:id')] || '';
      caminho = caminho.startsWith('/') ? caminho.slice(1) : 'xl/' + caminho.replace(/^\.\//, '');
      const xml = await zip.ler(caminho);
      if (!xml) continue;
      const linhas = [];
      (xml.match(/<row\b[^>]*>[\s\S]*?<\/row>|<row\b[^>]*\/>/g) || []).forEach((row, kRow) => {
        const r = Number(atributo(row.match(/<row\b[^>]*>/)[0], 'r')) || kRow + 1;
        const linha = [];
        let proxCol = 0;
        (row.match(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g) || []).forEach((c) => {
          const abre = c.match(/<c\b[^>]*>/)[0];
          const ref = atributo(abre, 'r');
          const col = ref ? colunaIdx(ref) : proxCol;
          proxCol = col + 1;
          const t = atributo(abre, 't'), st = Number(atributo(abre, 's') || 0);
          const v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
          let valor = '';
          if (t === 's') valor = strings[Number(v)] != null ? strings[Number(v)] : '';
          else if (t === 'inlineStr') valor = textosT((c.match(/<is>[\s\S]*?<\/is>/) || [''])[0]);
          else if (t === 'str' || t === 'e') valor = v != null ? entidades(v) : '';
          else if (t === 'b') valor = v === '1' ? 'VERDADEIRO' : 'FALSO';
          else if (v != null) { const n = Number(v); valor = estiloData[st] ? (serialParaIso(n, base1904) || n) : n; }
          linha[col] = valor;
        });
        for (let i = 0; i < linha.length; i++) if (linha[i] === undefined) linha[i] = '';
        linhas[r - 1] = linha;
      });
      const densas = [];
      for (let i = 0; i < linhas.length; i++) densas.push(linhas[i] || []);
      abas.push({ nome, linhas: densas.filter((l) => l.some((c) => String(c).trim() !== '')) });
    }
    return abas;
  }

  /* ---------- XLS (BIFF8 dentro de um arquivo CFB) ---------- */
  function abrirCfb(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const tamSetor = 1 << dv.getUint16(30, true), tamMini = 1 << dv.getUint16(32, true);
    const corteMini = dv.getUint32(56, true);
    const setor = (n) => 512 + n * tamSetor;
    const FIM = 0xfffffffe, LIVRE = 0xffffffff;
    // DIFAT -> setores da FAT
    const setoresFat = [];
    for (let i = 0; i < 109; i++) { const s = dv.getUint32(76 + i * 4, true); if (s !== LIVRE && s !== FIM) setoresFat.push(s); }
    let difat = dv.getUint32(68, true), guarda = 0;
    while (difat !== FIM && difat !== LIVRE && guarda++ < 10000) {
      const por = tamSetor / 4 - 1;
      for (let i = 0; i < por; i++) { const s = dv.getUint32(setor(difat) + i * 4, true); if (s !== LIVRE && s !== FIM) setoresFat.push(s); }
      difat = dv.getUint32(setor(difat) + por * 4, true);
    }
    const fat = [];
    setoresFat.forEach((s) => { for (let i = 0; i < tamSetor / 4; i++) fat.push(dv.getUint32(setor(s) + i * 4, true)); });
    const cadeia = (ini, tabela) => { const out = []; let s = ini, g2 = 0; while (s !== FIM && s !== LIVRE && s < tabela.length && g2++ < 1e6) { out.push(s); s = tabela[s]; } return out; };
    const lerCadeia = (ini) => { const sets = cadeia(ini, fat); const out = new Uint8Array(sets.length * tamSetor); sets.forEach((s, k) => out.set(bytes.subarray(setor(s), setor(s) + tamSetor), k * tamSetor)); return out; };
    const dir = lerCadeia(dv.getUint32(48, true));
    const ddv = new DataView(dir.buffer);
    const entradas = [];
    for (let p = 0; p + 128 <= dir.length; p += 128) {
      const nLen = ddv.getUint16(p + 64, true);
      if (!nLen) continue;
      let nome = ''; for (let i = 0; i < nLen / 2 - 1; i++) nome += String.fromCharCode(ddv.getUint16(p + i * 2, true));
      entradas.push({ nome, tipo: dir[p + 66], ini: ddv.getUint32(p + 116, true), tam: ddv.getUint32(p + 120, true) });
    }
    const raiz = entradas.find((e) => e.tipo === 5);
    let mini = null, minifat = null;
    function lerStream(nome) {
      const e = entradas.find((x) => x.nome === nome && x.tipo === 2);
      if (!e) return null;
      if (e.tam >= corteMini) return lerCadeia(e.ini).subarray(0, e.tam);
      if (!mini) {
        mini = lerCadeia(raiz.ini);
        const mf = lerCadeia(dv.getUint32(60, true)); const mdv = new DataView(mf.buffer);
        minifat = []; for (let i = 0; i < mf.length / 4; i++) minifat.push(mdv.getUint32(i * 4, true));
      }
      const sets = cadeia(e.ini, minifat);
      const out = new Uint8Array(sets.length * tamMini);
      sets.forEach((s, k) => out.set(mini.subarray(s * tamMini, (s + 1) * tamMini), k * tamMini));
      return out.subarray(0, e.tam);
    }
    return { lerStream, nomes: entradas.map((e) => e.nome) };
  }

  // Leitor que atravessa registros CONTINUE (usado na SST)
  function leitorSegmentos(segs) {
    let s = 0, p = 0;
    const atual = () => { while (s < segs.length && p >= segs[s].length) { s++; p = 0; } return segs[s]; };
    const u8 = () => { const b = atual(); if (!b) throw new ErroPlanilha('SST truncada'); return b[p++]; };
    const u16 = () => u8() | (u8() << 8);
    const u32 = () => (u16() | (u16() << 16)) >>> 0;
    const pular = (n) => { for (let i = 0; i < n; i++) u8(); };
    function chars(cch, alto) {
      let out = '';
      while (cch > 0) {
        let b = segs[s];
        if (!b || p >= b.length) { s++; p = 0; b = segs[s]; if (!b) throw new ErroPlanilha('SST truncada'); alto = (b[p++] & 1) === 1; }
        const disp = alto ? Math.floor((b.length - p) / 2) : b.length - p;
        const n = Math.min(cch, disp);
        for (let i = 0; i < n; i++) { out += String.fromCharCode(alto ? b[p] | (b[p + 1] << 8) : b[p]); p += alto ? 2 : 1; }
        cch -= n;
        if (cch > 0 && n === 0 && alto && b.length - p === 1) p++;   // byte solto no fim do segmento
      }
      return out;
    }
    return { u8, u16, u32, pular, chars };
  }

  function lerXls(bytes) {
    const cfb = abrirCfb(bytes);
    if (!cfb.nomes.includes('Workbook')) {
      if (cfb.nomes.includes('Book')) throw new ErroPlanilha('XLS muito antigo (Excel 95). Abra no Excel e salve como XLSX ou CSV.');
      throw new ErroPlanilha('Arquivo XLS sem a pasta de trabalho (Workbook).');
    }
    const w = cfb.lerStream('Workbook');
    const dv = new DataView(w.buffer, w.byteOffset, w.byteLength);
    const registros = [];
    for (let p = 0; p + 4 <= w.length;) {
      const tipo = dv.getUint16(p, true), tam = dv.getUint16(p + 2, true);
      registros.push({ tipo, pos: p, dados: w.subarray(p + 4, p + 4 + tam) });
      p += 4 + tam;
    }
    const sst = [], formatos = {}, xfs = [], folhas = [];
    let base1904 = false;
    const d16 = (b, o) => b[o] | (b[o + 1] << 8);
    const d32 = (b, o) => (d16(b, o) | (d16(b, o + 2) << 16)) >>> 0;
    const curto = (b, o, cch, flags) => { let s = ''; const alto = flags & 1; for (let i = 0; i < cch; i++) s += String.fromCharCode(alto ? d16(b, o + i * 2) : b[o + i]); return s; };
    const strXl = (b, o) => curto(b, o + 3, d16(b, o), b[o + 2]);    // XLUnicodeString (cch 16 bits)

    for (let k = 0; k < registros.length; k++) {
      const r = registros[k], b = r.dados;
      if (r.tipo === 0x002f) throw new ErroPlanilha('Planilha XLS protegida por senha. Remova a proteção ou exporte em CSV.');
      if (r.tipo === 0x0022) base1904 = d16(b, 0) === 1;
      else if (r.tipo === 0x041e) formatos[d16(b, 0)] = strXl(b, 2);
      else if (r.tipo === 0x00e0) xfs.push(d16(b, 2));
      else if (r.tipo === 0x0085) folhas.push({ pos: d32(b, 0), nome: curto(b, 8, b[6], b[7]), tipo: b[5] });
      else if (r.tipo === 0x00fc) {
        const segs = [b.subarray(8)];
        while (registros[k + 1] && registros[k + 1].tipo === 0x003c) segs.push(registros[++k].dados);
        const rd = leitorSegmentos(segs), total = d32(b, 4);
        for (let i = 0; i < total; i++) {
          const cch = rd.u16(), fl = rd.u8();
          const runs = fl & 8 ? rd.u16() : 0, ext = fl & 4 ? rd.u32() : 0;
          sst.push(rd.chars(cch, (fl & 1) === 1));
          rd.pular(runs * 4 + ext);
        }
      }
    }
    const ehData = (xf) => { const f = xfs[xf]; return FORMATOS_DATA_PADRAO.has(f) || (formatos[f] != null && ehFormatoData(formatos[f])); };
    const rk = (v) => { let n = v & 2 ? (v >> 2) : (() => { const buf = new DataView(new ArrayBuffer(8)); buf.setUint32(4, v & 0xfffffffc, true); buf.setUint32(0, 0, true); return buf.getFloat64(0, true); })(); if (v & 1) n /= 100; return n; };
    const num = (xf, n) => (ehData(xf) ? (serialParaIso(n, base1904) || n) : n);

    return folhas.filter((f) => f.tipo === 0).map((f) => {
      const linhas = [];
      const por = (row, col, v) => { (linhas[row] = linhas[row] || [])[col] = v; };
      let k = registros.findIndex((r) => r.pos === f.pos);
      if (k < 0) return { nome: f.nome, linhas: [] };
      for (k = k + 1; k < registros.length && registros[k].tipo !== 0x000a; k++) {
        const r = registros[k], b = r.dados;
        if (r.tipo === 0x00fd) por(d16(b, 0), d16(b, 2), sst[d32(b, 6)] != null ? sst[d32(b, 6)] : '');
        else if (r.tipo === 0x0203) por(d16(b, 0), d16(b, 2), num(d16(b, 4), new DataView(b.buffer, b.byteOffset + 6, 8).getFloat64(0, true)));
        else if (r.tipo === 0x027e) por(d16(b, 0), d16(b, 2), num(d16(b, 4), rk(d32(b, 6))));
        else if (r.tipo === 0x00bd) {
          const row = d16(b, 0), c0 = d16(b, 2), n = (b.length - 6) / 6;
          for (let i = 0; i < n; i++) por(row, c0 + i, num(d16(b, 4 + i * 6), rk(d32(b, 6 + i * 6))));
        } else if (r.tipo === 0x0204) por(d16(b, 0), d16(b, 2), strXl(b, 6));
        else if (r.tipo === 0x0205) por(d16(b, 0), d16(b, 2), b[7] ? '' : (b[6] ? 'VERDADEIRO' : 'FALSO'));
        else if (r.tipo === 0x0006) {
          const row = d16(b, 0), col = d16(b, 2), xf = d16(b, 4);
          if (b[12] === 0xff && b[13] === 0xff) {
            if (b[6] === 0 && registros[k + 1] && registros[k + 1].tipo === 0x0207) por(row, col, strXl(registros[k + 1].dados, 0));
            else if (b[6] === 1) por(row, col, b[8] ? 'VERDADEIRO' : 'FALSO');
          } else por(row, col, num(xf, new DataView(b.buffer, b.byteOffset + 6, 8).getFloat64(0, true)));
        }
      }
      const densas = [];
      for (let i = 0; i < linhas.length; i++) { const l = linhas[i] || []; for (let j = 0; j < l.length; j++) if (l[j] === undefined) l[j] = ''; densas.push(l); }
      return { nome: f.nome, linhas: densas.filter((l) => l.some((c) => String(c).trim() !== '')) };
    });
  }

  /* ---------- Entrada ---------- */
  async function ler(bytes, nomeArquivo) {
    if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
    if (!bytes.length) throw new ErroPlanilha('Arquivo vazio.');
    const avisos = [];
    let formato, abas;
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) { formato = 'xlsx'; abas = await lerXlsx(bytes); }
    else if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) { formato = 'xls'; abas = lerXls(bytes); }
    else {
      const texto = decodificarTexto(bytes);
      if (/^\s*</.test(texto) && /<table/i.test(texto)) { formato = 'html'; abas = lerHtml(texto); if (/\.xls$/i.test(nomeArquivo || '')) avisos.push('O arquivo .xls é na verdade uma tabela HTML; foi lido normalmente.'); }
      else if (/^\s*</.test(texto)) throw new ErroPlanilha('Arquivo parece HTML/XML, mas não tem tabela.');
      else { formato = 'csv'; const r = lerCsv(texto); abas = [{ nome: 'CSV', linhas: r.linhas }]; avisos.push(`CSV lido com separador "${r.separador}"`); }
    }
    abas = abas.filter((a) => a.linhas.length);
    if (!abas.length) throw new ErroPlanilha('A planilha não tem linhas com dados.');
    if (abas.length > 1) avisos.push(`A planilha tem ${abas.length} abas com dados; usando a maior ("${abas.slice().sort((a, b) => b.linhas.length - a.linhas.length)[0].nome}"). Troque a aba se necessário.`);
    return { formato, abas, avisos };
  }

  A.planilha = { ler, lerCsv, lerHtml, detectarSeparador, ErroPlanilha };
})(typeof self !== 'undefined' ? self : globalThis);

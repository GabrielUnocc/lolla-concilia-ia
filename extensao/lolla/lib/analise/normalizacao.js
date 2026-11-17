/*
 * Modo Análise — camada central de normalização.
 * Todos os leitores (francesinha, OFX, recebimentos IXC) passam por aqui, para que
 * qualquer banco entregue os dados no mesmo formato:
 *   - valores em centavos (inteiros)        - datas em AAAA-MM-DD
 *   - nosso número sem zeros à esquerda      - textos com caracteres corrigidos
 *   - identificadores sempre como texto
 * Funções puras (sem DOM): rodam no navegador, na extensão e nos testes em Node.
 * Valor ou data inválidos devolvem NaN / '' — quem chama decide e registra o erro (nunca some em silêncio).
 */
(function (g) {
  const L = g.Lolla = g.Lolla || { core: {}, services: {}, domain: {}, ui: {} };
  L.domain.analise = L.domain.analise || {};

  /* ---------- Valores ---------- */
  // Aceita número (reais) ou texto: "1.234,56", "R$ 1.234,56", "1234,56", "1,234.56", "1234.56", "(12,00)", "-12,00", "12,00 D"
  function centavos(v) {
    if (v == null || v === '') return NaN;
    if (typeof v === 'number') return isFinite(v) ? Math.round(v * 100 + (v >= 0 ? 1e-7 : -1e-7)) : NaN;
    let s = String(v).replace(/[\s ]/g, '').replace(/^R\$/i, '').replace(/R\$/i, '');
    if (!s) return NaN;
    let negativo = false;
    if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1); }
    const sufixo = s.match(/([DdCc])$/);                 // "12,00D" (débito) / "12,00C" (crédito)
    if (sufixo) { if (/d/i.test(sufixo[1])) negativo = !negativo; s = s.slice(0, -1); }
    if (/-$/.test(s)) { negativo = !negativo; s = s.slice(0, -1); }
    if (/^-/.test(s)) { negativo = !negativo; s = s.slice(1); }
    if (/^\+/.test(s)) s = s.slice(1);
    s = s.replace(/^R\$/i, '');
    if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return NaN;
    const ultPonto = s.lastIndexOf('.'), ultVirg = s.lastIndexOf(',');
    if (ultPonto >= 0 && ultVirg >= 0) {
      // os dois separadores: o último é o decimal
      s = ultVirg > ultPonto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (ultVirg >= 0) {
      if ((s.match(/,/g) || []).length > 1) return NaN;
      s = s.replace(',', '.');                       // padrão brasileiro: vírgula é decimal
    } else if (ultPonto >= 0) {
      if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');       // "1.234" = mil duzentos e trinta e quatro
      else if ((s.match(/\./g) || []).length > 1) return NaN;
    }
    const n = Number(s);
    if (!isFinite(n)) return NaN;
    const c = Math.round(n * 100 + 1e-7);
    return negativo ? -c : c;
  }

  /* ---------- Datas ---------- */
  const valida = (a, m, d) => {
    if (!(a >= 1990 && a <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
    const dt = new Date(Date.UTC(a, m - 1, d));
    return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  };
  const iso = (a, m, d) => (valida(a, m, d) ? `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '');

  // Número de série do Excel (dias desde 30/12/1899) -> ISO
  function dataDeSerialExcel(n) {
    if (!(n > 20000 && n < 80000)) return '';
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 864e5);
    return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }

  // Aceita "02/11/2026", "2/11/26", "02-11-2026", "02.11.2026", "2026-11-02", "20261102", com ou sem hora, Date e série do Excel
  function data(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date) return isNaN(v) ? '' : iso(v.getFullYear(), v.getMonth() + 1, v.getDate());
    if (typeof v === 'number') return dataDeSerialExcel(v);
    const s = String(v).trim();
    let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:\D|$)/);
    if (m) {
      let a = Number(m[3]);
      if (m[3].length === 2) a += 2000;
      return iso(a, Number(m[2]), Number(m[1]));
    }
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\D|$)/);
    if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
    m = s.match(/^(\d{4})(\d{2})(\d{2})(?:\d{4}(?:\d{2})?)?(?:\D|$)/);   // AAAAMMDD[HHMM[SS]] (OFX)
    if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
    if (/^\d{5}(\.\d+)?$/.test(s)) return dataDeSerialExcel(Number(s));
    return '';
  }

  // Dias entre duas datas ISO (b - a)
  const diaNum = (d) => { const [a, m, dd] = d.split('-').map(Number); return Date.UTC(a, m - 1, dd) / 864e5; };
  const difDias = (a, b) => diaNum(b) - diaNum(a);
  const somarDias = (d, n) => {
    const dt = new Date((diaNum(d) + n) * 864e5);
    return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  };

  /* ---------- Identificadores ---------- */
  // Sempre texto. Números vindos de planilha (12345 ou 12345.0) viram "12345"; notação científica é recusada.
  function id(v) {
    if (v == null) return '';
    if (typeof v === 'number') {
      if (!isFinite(v)) return '';
      if (Math.abs(v) >= 1e15) return '';                 // perdeu precisão na planilha
      return Number.isInteger(v) ? String(v) : String(v).replace(/\.0+$/, '');
    }
    const s = String(v).trim();
    if (/^\d+(\.\d+)?e\+\d+$/i.test(s)) return '';        // 1.23E+15: precisão perdida
    return /^\d+\.0+$/.test(s) ? s.replace(/\.0+$/, '') : s;   // "12345.0" (planilha) -> "12345"
  }

  /*
   * Nosso número. Regra (mesma da ferramenta Conciliacao da francesinha):
   * - o que vem depois do hífen é o dígito verificador (DV) e sai da chave;
   * - só dígitos, sem zeros à esquerda.
   * Também devolve "semUltimo" (último dígito removido), usado só como 2ª tentativa
   * quando um dos lados grava o DV colado (sem hífen). Quem usa essa alternativa registra o motivo.
   */
  function nossoNumero(v) {
    const bruto = id(v);
    if (!bruto) return { chave: '', bruto: '', semUltimo: '', temDv: false };
    const temDv = /-\s*[\dXxPp]$/.test(bruto);
    const base = temDv ? bruto.replace(/-\s*[\dXxPp]$/, '') : bruto;
    const digitos = base.replace(/\D/g, '');
    const chave = digitos.replace(/^0+/, '');
    const semUltimo = !temDv && digitos.length > 1 ? digitos.slice(0, -1).replace(/^0+/, '') : '';
    return { chave, bruto, semUltimo, temDv };
  }

  /* ---------- Textos ---------- */
  // Conserta texto UTF-8 que foi lido como Latin-1/Windows-1252 ("CRÃ‰D.LIQUIDAÃ‡ÃƒO" -> "CRÉD.LIQUIDAÇÃO")
  const CP1252 = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89,
    0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96,
    0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };
  function corrigirCodificacao(s) {
    if (!/[ÃÂ][\u0080-ÿŒ-™]/.test(s)) return s;
    const bytes = [];
    for (const ch of s) {
      const c = ch.codePointAt(0);
      if (c < 256) bytes.push(c);
      else if (CP1252[c] != null) bytes.push(CP1252[c]);
      else return s;                                     // tem caractere que não é Latin-1: não mexe
    }
    try {
      const out = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
      return out;
    } catch (e) {
      return s;                                          // conserto não é seguro: mantém o original
    }
  }

  function texto(v) {
    if (v == null) return '';
    let s = String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ');
    s = corrigirCodificacao(s).replace(/�/g, '?');
    return s.replace(/\s+/g, ' ').trim();
  }

  // Chave para comparar textos: sem acento, maiúsculas, só letras/números/espaço.
  // Caracteres quebrados que sobrarem viram espaço e não atrapalham as regras por trecho.
  function chaveTexto(v) {
    return texto(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
      .replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  const reais = (c) => (isFinite(c) ? (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
  const brDeIso = (d) => { const [a, m, dd] = String(d || '').split('-'); return dd ? `${dd}/${m}/${a}` : ''; };

  L.domain.analise.norm = { centavos, data, dataDeSerialExcel, difDias, somarDias, id, nossoNumero, texto, chaveTexto, corrigirCodificacao, reais, brDeIso };
})(typeof self !== 'undefined' ? self : globalThis);

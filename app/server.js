import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, unlink, stat } from 'node:fs/promises';
import { resolve, extname, join, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { abrirBanco, UPLOAD_DIR } from './lib/db.js';
import { conferirSenha, HASH_FICTICIO, novoToken, hashToken } from './lib/senha.js';
import { normalizarDados, avisosDePeriodo, resumo, paraISO, liquido, ErroValidacao } from './lib/dados.js';

const PUBLIC = fileURLToPath(new URL('./public/', import.meta.url));
const PORTA = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const SESSAO_HORAS = Number(process.env.SESSAO_HORAS || 12);
const COOKIE_SEGURO = process.env.COOKIE_SEGURO === '1';
const LIMITE_CORPO = 20 * 1024 * 1024; // JSON + francesinha em base64
const LIMITE_FRANCESINHA = 10 * 1024 * 1024;
const TIPOS_FRANCESINHA = ['.pdf', '.csv', '.txt', '.ret', '.xls', '.xlsx', '.ofx'];

export function criarApp(db) {
  // ---------- utilitários ----------
  const enviarJSON = (res, status, corpo, extra = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
    res.end(JSON.stringify(corpo));
  };
  const erro = (res, status, mensagem) => enviarJSON(res, status, { erro: mensagem });

  const lerCorpo = (req) => new Promise((ok, falha) => {
    const tipo = req.headers['content-type'] || '';
    if (!tipo.startsWith('application/json')) return falha(Object.assign(new Error('Envie JSON'), { status: 415 }));
    let tam = 0; const partes = [];
    req.on('data', (c) => {
      tam += c.length;
      if (tam > LIMITE_CORPO) { falha(Object.assign(new Error('Arquivo grande demais'), { status: 413 })); req.destroy(); }
      else partes.push(c);
    });
    req.on('end', () => {
      try { ok(partes.length ? JSON.parse(Buffer.concat(partes).toString('utf8')) : {}); }
      catch { falha(Object.assign(new Error('JSON inválido'), { status: 400 })); }
    });
    req.on('error', falha);
  });

  const lerCookies = (req) => Object.fromEntries(
    (req.headers.cookie || '').split(';').map((p) => p.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]),
  );
  const cookieSessao = (valor, maxAge) =>
    `sessao=${valor}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${COOKIE_SEGURO ? '; Secure' : ''}`;

  // ---------- sessões ----------
  const qSessao = db.prepare(`SELECT u.id, u.email, u.nome FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
                              WHERE s.token_hash = ? AND s.expira_em > ? AND u.ativo = 1`);
  const usuarioDaSessao = (req) => {
    const t = lerCookies(req).sessao;
    return t ? qSessao.get(hashToken(t), Date.now()) : undefined;
  };

  // Limite simples de tentativas de login por IP (em memória).
  const tentativas = new Map();
  const bloqueado = (ip) => {
    const t = tentativas.get(ip);
    return t && t.n >= 8 && Date.now() - t.desde < 15 * 60 * 1000;
  };
  const registrarFalha = (ip) => {
    const t = tentativas.get(ip);
    if (!t || Date.now() - t.desde > 15 * 60 * 1000) tentativas.set(ip, { n: 1, desde: Date.now() });
    else t.n++;
  };

  // ---------- conciliações ----------
  const qVinculos = db.prepare(`SELECT v.id, v.ixc_ids, v.ext_ids, v.valor_centavos, v.criado_em, u.nome AS usuario
                                FROM vinculos v JOIN usuarios u ON u.id = v.usuario_id WHERE v.conciliacao_id = ? ORDER BY v.id`);
  const vinculosDe = (id) => qVinculos.all(id).map((v) => ({ ...v, ixc_ids: JSON.parse(v.ixc_ids), ext_ids: JSON.parse(v.ext_ids) }));
  const qConc = db.prepare(`SELECT c.*, u.nome AS criado_por FROM conciliacoes c JOIN usuarios u ON u.id = c.usuario_id WHERE c.id = ?`);

  const rotas = [];
  const rota = (metodo, padrao, fn, publica = false) => {
    const chaves = [];
    const re = new RegExp('^' + padrao.replace(/:(\w+)/g, (_, k) => (chaves.push(k), '(\\d+)')) + '$');
    rotas.push({ metodo, re, chaves, fn, publica });
  };

  rota('POST', '/api/login', async (req, res) => {
    const ip = req.socket.remoteAddress || '?';
    if (bloqueado(ip)) return erro(res, 429, 'Muitas tentativas. Aguarde 15 minutos.');
    const { email, senha } = await lerCorpo(req);
    if (typeof email !== 'string' || typeof senha !== 'string' || !email || !senha) return erro(res, 400, 'Informe e-mail e senha');
    const u = db.prepare('SELECT id, nome, email, senha_hash FROM usuarios WHERE email = ? AND ativo = 1').get(email.trim());
    const ok = conferirSenha(senha, u ? u.senha_hash : HASH_FICTICIO) && !!u;
    if (!ok) { registrarFalha(ip); return erro(res, 401, 'E-mail ou senha incorretos'); }
    tentativas.delete(ip);
    const token = novoToken();
    db.prepare('DELETE FROM sessoes WHERE expira_em < ?').run(Date.now());
    db.prepare('INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES (?, ?, ?)')
      .run(hashToken(token), u.id, Date.now() + SESSAO_HORAS * 3600 * 1000);
    enviarJSON(res, 200, { id: u.id, nome: u.nome, email: u.email }, { 'Set-Cookie': cookieSessao(token, SESSAO_HORAS * 3600) });
  }, true);

  rota('POST', '/api/logout', async (req, res) => {
    const t = lerCookies(req).sessao;
    if (t) db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(hashToken(t));
    enviarJSON(res, 200, { ok: true }, { 'Set-Cookie': cookieSessao('', 0) });
  }, true);

  rota('GET', '/api/me', async (req, res, { usuario }) => enviarJSON(res, 200, usuario));

  rota('GET', '/api/conciliacoes', async (req, res) => {
    const linhas = db.prepare(`SELECT c.id, c.conta, c.data_inicial, c.data_final, c.observacao, c.dados_json, c.avisos_json,
                                      c.francesinha_nome, c.criado_em, c.atualizado_em, u.nome AS criado_por
                               FROM conciliacoes c JOIN usuarios u ON u.id = c.usuario_id ORDER BY c.atualizado_em DESC, c.id DESC`).all();
    enviarJSON(res, 200, linhas.map(({ dados_json, avisos_json, ...c }) => ({
      ...c,
      avisos: JSON.parse(avisos_json).length,
      resumo: resumo(JSON.parse(dados_json), vinculosDe(c.id)),
    })));
  });

  // Pré-visualização: valida o JSON sem salvar (usada pelo formulário).
  rota('POST', '/api/conciliacoes/validar', async (req, res) => {
    const { dados } = await lerCorpo(req);
    const n = normalizarDados(dados);
    enviarJSON(res, 200, { avisos: n.avisos, sugestao: n.sugestao, resumo: resumo(n.dados, []) });
  });

  rota('POST', '/api/conciliacoes', async (req, res, { usuario }) => {
    const corpo = await lerCorpo(req);
    const conta = String(corpo.conta ?? '').trim();
    if (!conta) throw new ErroValidacao('Informe a conta bancária');
    if (conta.length > 120) throw new ErroValidacao('Nome da conta muito longo');
    const ini = paraISO(corpo.data_inicial, 'Data inicial');
    const fim = paraISO(corpo.data_final, 'Data final');
    if (ini > fim) throw new ErroValidacao('A data inicial é depois da data final');
    const { dados, avisos } = normalizarDados(corpo.dados);
    avisos.push(...avisosDePeriodo(dados, ini, fim));

    let fr = { nome: null, arquivo: null, tipo: null };
    if (corpo.francesinha) {
      const nome = String(corpo.francesinha.nome || 'francesinha').replace(/[^\w.\- ()]/g, '_').slice(0, 120);
      const ext = extname(nome).toLowerCase();
      if (!TIPOS_FRANCESINHA.includes(ext)) throw new ErroValidacao(`Francesinha: use ${TIPOS_FRANCESINHA.join(', ')}`);
      const buf = Buffer.from(String(corpo.francesinha.base64 || ''), 'base64');
      if (!buf.length) throw new ErroValidacao('Francesinha: arquivo vazio');
      if (buf.length > LIMITE_FRANCESINHA) throw new ErroValidacao('Francesinha: máximo de 10 MB');
      await mkdir(UPLOAD_DIR, { recursive: true });
      const arquivo = randomBytes(16).toString('hex') + ext;
      await writeFile(join(UPLOAD_DIR, arquivo), buf, { mode: 0o600 });
      fr = { nome, arquivo, tipo: String(corpo.francesinha.tipo || 'application/octet-stream').slice(0, 100) };
    }

    const r = db.prepare(`INSERT INTO conciliacoes (usuario_id, conta, data_inicial, data_final, observacao, dados_json, avisos_json,
                                                   francesinha_nome, francesinha_arquivo, francesinha_tipo)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(usuario.id, conta, ini, fim, String(corpo.observacao ?? '').slice(0, 2000), JSON.stringify(dados), JSON.stringify(avisos),
        fr.nome, fr.arquivo, fr.tipo);
    enviarJSON(res, 201, { id: Number(r.lastInsertRowid), avisos });
  });

  rota('GET', '/api/conciliacoes/:id', async (req, res, { p }) => {
    const c = qConc.get(p.id);
    if (!c) return erro(res, 404, 'Conciliação não encontrada');
    const { dados_json, avisos_json, francesinha_arquivo, ...resto } = c;
    const dados = JSON.parse(dados_json), vinculos = vinculosDe(c.id);
    enviarJSON(res, 200, { ...resto, avisos: JSON.parse(avisos_json), dados, vinculos, resumo: resumo(dados, vinculos) });
  });

  rota('DELETE', '/api/conciliacoes/:id', async (req, res) => {
    const c = qConc.get(req.p.id);
    if (!c) return erro(res, 404, 'Conciliação não encontrada');
    db.prepare('DELETE FROM conciliacoes WHERE id = ?').run(c.id);
    if (c.francesinha_arquivo) await unlink(join(UPLOAD_DIR, c.francesinha_arquivo)).catch(() => {});
    enviarJSON(res, 200, { ok: true });
  });

  rota('GET', '/api/conciliacoes/:id/francesinha', async (req, res, { p }) => {
    const c = qConc.get(p.id);
    if (!c || !c.francesinha_arquivo) return erro(res, 404, 'Sem francesinha anexada');
    const buf = await readFile(join(UPLOAD_DIR, c.francesinha_arquivo));
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(c.francesinha_nome)}`,
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  });

  // Confere uma lista de grupos { ixc: [ids], ext: [ids] }: ids existem, estão pendentes,
  // não se repetem entre grupos e os totais de cada grupo batem. O servidor refaz as somas.
  function validarGrupos(c, grupos) {
    const dados = JSON.parse(c.dados_json), vinculos = vinculosDe(c.id);
    const usados = { ixc: new Set(vinculos.flatMap((v) => v.ixc_ids)), ext: new Set(vinculos.flatMap((v) => v.ext_ids)) };
    const nesteEnvio = { ixc: new Set(), ext: new Set() };
    return grupos.map((g, i) => {
      const { ixc, ext } = g || {};
      if (!Array.isArray(ixc) || !Array.isArray(ext) || !ixc.length || !ext.length) {
        throw new ErroValidacao(grupos.length > 1 ? `Par ${i + 1}: falta linha de um dos lados` : 'Selecione ao menos uma linha de cada lado');
      }
      const pegar = (lista, ids, lado, nome) => [...new Set(ids.map(String))].map((id) => {
        const r = lista.find((x) => x.id === id);
        if (!r) throw new ErroValidacao(`${nome}: id ${id} não existe`);
        if (r.conciliado || usados[lado].has(id)) throw new ErroValidacao(`${nome}: id ${id} já está conciliado`);
        if (nesteEnvio[lado].has(id)) throw new ErroValidacao(`${nome}: id ${id} aparece em mais de um par`);
        nesteEnvio[lado].add(id);
        return r;
      });
      const a = pegar(dados.movimentacao, ixc, 'ixc', 'Movimentação');
      const b = pegar(dados.extrato, ext, 'ext', 'Extrato');
      const sa = a.reduce((s, r) => s + liquido(r), 0), sb = b.reduce((s, r) => s + liquido(r), 0);
      if (sa !== sb) throw new ErroValidacao(grupos.length > 1 ? `Par ${i + 1}: os valores dos dois lados não são iguais` : 'Os totais selecionados dos dois lados não são iguais');
      return { ixc: a.map((x) => x.id), ext: b.map((x) => x.id), valor: sa };
    });
  }

  const qInserirVinculo = db.prepare('INSERT INTO vinculos (conciliacao_id, usuario_id, ixc_ids, ext_ids, valor_centavos) VALUES (?, ?, ?, ?, ?)');
  function gravarGrupos(c, usuario, grupos) {
    db.exec('BEGIN');
    try {
      const ids = grupos.map((g) => Number(qInserirVinculo.run(c.id, usuario.id, JSON.stringify(g.ixc), JSON.stringify(g.ext), g.valor).lastInsertRowid));
      db.prepare("UPDATE conciliacoes SET atualizado_em = datetime('now') WHERE id = ?").run(c.id);
      db.exec('COMMIT');
      return ids;
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }

  // Vincula as linhas selecionadas como um único grupo (conciliação manual).
  rota('POST', '/api/conciliacoes/:id/vinculos', async (req, res, { p, usuario }) => {
    const c = qConc.get(p.id);
    if (!c) return erro(res, 404, 'Conciliação não encontrada');
    const { ixc, ext } = await lerCorpo(req);
    const [id] = gravarGrupos(c, usuario, validarGrupos(c, [{ ixc, ext }]));
    enviarJSON(res, 201, { id });
  });

  // Vincula vários pares de uma vez (ex.: "Selecionar valores iguais"). Tudo ou nada.
  rota('POST', '/api/conciliacoes/:id/vinculos/lote', async (req, res, { p, usuario }) => {
    const c = qConc.get(p.id);
    if (!c) return erro(res, 404, 'Conciliação não encontrada');
    const { pares } = await lerCorpo(req);
    if (!Array.isArray(pares) || !pares.length) throw new ErroValidacao('Nenhum par enviado');
    if (pares.length > 5000) throw new ErroValidacao('Pares demais em um envio');
    const ids = gravarGrupos(c, usuario, validarGrupos(c, pares));
    enviarJSON(res, 201, { ids });
  });

  rota('DELETE', '/api/conciliacoes/:id/vinculos/:vid', async (req, res, { p }) => {
    const r = db.prepare('DELETE FROM vinculos WHERE id = ? AND conciliacao_id = ?').run(p.vid, p.id);
    if (!r.changes) return erro(res, 404, 'Vínculo não encontrado');
    db.prepare("UPDATE conciliacoes SET atualizado_em = datetime('now') WHERE id = ?").run(p.id);
    enviarJSON(res, 200, { ok: true });
  });

  // ---------- arquivos estáticos ----------
  const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
  const PAGINAS_PUBLICAS = new Set(['/login.html']);

  async function estatico(req, res, caminho) {
    if (caminho === '/') caminho = '/index.html';
    if (!extname(caminho)) caminho += '.html';
    const alvo = resolve(PUBLIC, '.' + caminho);
    if (!alvo.startsWith(PUBLIC.endsWith(sep) ? PUBLIC : PUBLIC + sep)) return erro(res, 403, 'Proibido');
    const ehPagina = extname(alvo) === '.html';
    if (ehPagina && !PAGINAS_PUBLICAS.has(caminho) && !usuarioDaSessao(req)) {
      res.writeHead(302, { Location: '/login.html?volta=' + encodeURIComponent(req.url) });
      return res.end();
    }
    try {
      if (!(await stat(alvo)).isFile()) throw new Error();
      const buf = await readFile(alvo);
      res.writeHead(200, { 'Content-Type': MIME[extname(alvo)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(buf);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Não encontrado');
    }
  }

  return async function app(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
    const url = new URL(req.url, 'http://local');
    try {
      if (!url.pathname.startsWith('/api/')) return await estatico(req, res, decodeURIComponent(url.pathname));
      for (const r of rotas) {
        const m = url.pathname.match(r.re);
        if (!m || r.metodo !== req.method) continue;
        const p = Object.fromEntries(r.chaves.map((k, i) => [k, Number(m[i + 1])]));
        req.p = p;
        const usuario = r.publica ? null : usuarioDaSessao(req);
        if (!r.publica && !usuario) return erro(res, 401, 'Sessão expirada. Entre novamente.');
        return await r.fn(req, res, { p, usuario });
      }
      erro(res, 404, 'Rota não encontrada');
    } catch (e) {
      if (e instanceof ErroValidacao) return erro(res, 422, e.message);
      if (e.status) return erro(res, e.status, e.message);
      console.error(e);
      erro(res, 500, 'Erro interno');
    }
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const db = abrirBanco();
  const total = db.prepare('SELECT COUNT(*) n FROM usuarios').get().n;
  createServer(criarApp(db)).listen(PORTA, HOST, () => {
    console.log(`Concilia IA em http://${HOST}:${PORTA}`);
    if (!total) console.log('Nenhum usuário cadastrado. Crie um com: npm run criar-usuario');
  });
}

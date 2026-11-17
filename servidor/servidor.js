/*
 * Servidor local da AR Lolla.
 * - Serve o MVP (pasta mvp/) em http://127.0.0.1:3000
 * - Guarda o Contexto da IA num arquivo local e atende o MVP e a extensão,
 *   para os dois usarem a MESMA lista de contextos.
 * Sem dependências: só Node 22+.
 */
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises';
import { resolve, join, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const PASTA_MVP = join(RAIZ, 'mvp');
const PORTA = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const ARQUIVO = resolve(process.env.ARQUIVO_CONTEXTOS || join(RAIZ, 'servidor', 'dados', 'contextos.json'));
// Contextos que já vêm com o projeto: usados só na primeira vez, quando ainda não há lista salva
const INICIAIS = join(RAIZ, 'servidor', 'contextos-iniciais.json');

// Limites para não estourar o consumo de tokens (1 token ≈ 4 caracteres em português)
export const LIMITES = { maxContextos: 20, maxTitulo: 120, maxTexto: 4000, maxTotal: 20000 };
// O contexto vai para a IA: recusa o que parece dado pessoal de cliente
const DADO_PESSOAL = [
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/, 'um CPF'],
  [/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/, 'um CNPJ'],
  [/[\w.+-]+@[\w-]+\.[\w.]+/, 'um e-mail'],
];

class ErroValidacao extends Error {}

/* ---------- armazenamento: um arquivo JSON, gravado de forma atômica ---------- */
export function criarArmazem(arquivo = ARQUIVO, iniciais = INICIAIS) {
  let fila = Promise.resolve();
  const lerIniciais = async () => {
    if (!iniciais) return [];
    try { return JSON.parse(await readFile(iniciais, 'utf8')); } catch { return []; }
  };
  const ler = async () => {
    try { return JSON.parse(await readFile(arquivo, 'utf8')); }
    catch (e) {
      if (e.code !== 'ENOENT') throw e;
      const agora = new Date().toISOString();
      const contextos = (await lerIniciais()).map((c, k) => ({ id: k + 1, titulo: c.titulo, texto: c.texto, criado_em: agora, atualizado_em: agora }));
      return { proximoId: contextos.length + 1, contextos };
    }
  };
  const gravar = async (dados) => {
    await mkdir(dirname(arquivo), { recursive: true });
    const tmp = arquivo + '.tmp';
    await writeFile(tmp, JSON.stringify(dados, null, 1), { mode: 0o600 });
    await rename(tmp, arquivo);
  };
  // Alterações em fila: duas gravações ao mesmo tempo não se atropelam
  // (um erro de validação devolve o erro só para quem pediu e não trava a fila)
  const alterar = (fn) => {
    const p = fila.then(async () => { const d = await ler(); const r = fn(d); await gravar(d); return r; });
    fila = p.catch(() => {});
    return p;
  };
  return { ler, alterar };
}


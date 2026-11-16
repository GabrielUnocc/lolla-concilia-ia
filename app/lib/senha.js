import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';

const N = 16384, R = 8, P = 1, LEN = 64;

export function gerarHash(senha) {
  const sal = randomBytes(16);
  const hash = scryptSync(senha, sal, LEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${sal.toString('base64')}$${hash.toString('base64')}`;
}

export function conferirSenha(senha, armazenado) {
  const partes = String(armazenado).split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, n, r, p, sal, hash] = partes;
  const esperado = Buffer.from(hash, 'base64');
  const obtido = scryptSync(senha, Buffer.from(sal, 'base64'), esperado.length, { N: +n, r: +r, p: +p });
  return timingSafeEqual(esperado, obtido);
}

// Hash usado quando o e-mail não existe, para o tempo de resposta ser igual.
export const HASH_FICTICIO = gerarHash(randomBytes(12).toString('hex'));

export const novoToken = () => randomBytes(32).toString('base64url');
export const hashToken = (t) => createHash('sha256').update(t).digest('hex');

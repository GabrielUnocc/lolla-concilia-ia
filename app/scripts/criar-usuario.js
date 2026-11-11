// Cria ou atualiza um usuário. Uso:
//   npm run criar-usuario -- email@empresa.com "Nome da Pessoa"
//   npm run criar-usuario -- email@empresa.com --desativar
// A senha é pedida no terminal (não aparece na tela nem fica no histórico).
import { createInterface } from 'node:readline';
import { abrirBanco } from '../lib/db.js';
import { gerarHash } from '../lib/senha.js';

const [email, nomeOuFlag] = process.argv.slice(2);
if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) {
  console.error('Uso: npm run criar-usuario -- email@empresa.com "Nome"  |  --desativar');
  process.exit(1);
}
const db = abrirBanco();

if (nomeOuFlag === '--desativar') {
  const r = db.prepare('UPDATE usuarios SET ativo = 0 WHERE email = ?').run(email);
  db.prepare('DELETE FROM sessoes WHERE usuario_id IN (SELECT id FROM usuarios WHERE email = ?)').run(email);
  console.log(r.changes ? `Usuário ${email} desativado.` : 'Usuário não encontrado.');
  process.exit(0);
}

function perguntarOculto(pergunta) {
  return new Promise((ok) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(pergunta)) rl.output.write(s); };
    rl.question(pergunta, (r) => { rl.output.write('\n'); rl.close(); ok(r); });
  });
}

const senha = process.env.SENHA || await perguntarOculto('Senha (mínimo 10 caracteres): ');
if (senha.length < 10) { console.error('Senha curta demais.'); process.exit(1); }
if (!process.env.SENHA) {
  const confirma = await perguntarOculto('Repita a senha: ');
  if (confirma !== senha) { console.error('As senhas não conferem.'); process.exit(1); }
}

const existente = db.prepare('SELECT id, nome FROM usuarios WHERE email = ?').get(email);
if (existente) {
  db.prepare('UPDATE usuarios SET senha_hash = ?, ativo = 1, nome = ? WHERE id = ?')
    .run(gerarHash(senha), nomeOuFlag || existente.nome, existente.id);
  db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(existente.id);
  console.log(`Senha de ${email} atualizada.`);
} else {
  db.prepare('INSERT INTO usuarios (email, nome, senha_hash) VALUES (?, ?, ?)').run(email, nomeOuFlag || email.split('@')[0], gerarHash(senha));
  console.log(`Usuário ${email} criado.`);
}

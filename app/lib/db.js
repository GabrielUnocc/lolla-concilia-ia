import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const DATA_DIR = resolve(process.env.DATA_DIR || 'data');
export const UPLOAD_DIR = resolve(DATA_DIR, 'francesinhas');

export function abrirBanco(arquivo = resolve(DATA_DIR, 'concilia.db')) {
  if (arquivo !== ':memory:') mkdirSync(dirname(arquivo), { recursive: true });
  const db = new DatabaseSync(arquivo);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      nome TEXT NOT NULL,
      senha_hash TEXT NOT NULL,
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessoes (
      token_hash TEXT PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      expira_em INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conciliacoes (
      id INTEGER PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      conta TEXT NOT NULL,
      data_inicial TEXT NOT NULL,
      data_final TEXT NOT NULL,
      observacao TEXT NOT NULL DEFAULT '',
      dados_json TEXT NOT NULL,
      avisos_json TEXT NOT NULL DEFAULT '[]',
      francesinha_nome TEXT,
      francesinha_arquivo TEXT,
      francesinha_tipo TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vinculos (
      id INTEGER PRIMARY KEY,
      conciliacao_id INTEGER NOT NULL REFERENCES conciliacoes(id) ON DELETE CASCADE,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      ixc_ids TEXT NOT NULL,
      ext_ids TEXT NOT NULL,
      valor_centavos INTEGER NOT NULL,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS vinculos_conciliacao ON vinculos(conciliacao_id);
  `);
  return db;
}

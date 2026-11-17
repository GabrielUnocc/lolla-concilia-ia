/*
 * Contexto da IA: textos que o suporte cadastra (regras de banco, padrões de histórico,
 * casos resolvidos) e que vão junto com as sobras na análise.
 * Ficam no servidor local (npm start), o MESMO que a extensão Lolla usa: uma lista só para os dois.
 */
Lolla.services.contexto = (function () {
  // Com o MVP aberto pelo servidor, a API está na mesma origem. Aberto pelo arquivo (file://), não há servidor.
  const disponivel = () => /^https?:$/.test(location.protocol);

  async function chamar(metodo, caminho, corpo) {
    if (!disponivel()) throw new Error('Abra a Lolla pelo servidor (npm start e depois http://127.0.0.1:3000) para usar o Contexto da IA.');
    let r;
    try {
      r = await fetch(caminho, { method: metodo, cache: 'no-store',
        headers: corpo ? { 'Content-Type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : undefined });
    } catch (e) { throw new Error('O servidor da Lolla não respondeu. Confira se o npm start está rodando.'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro ' + r.status);
    return j;
  }

  return {
    disponivel,
    listar: () => chamar('GET', '/api/contextos'),
    criar: (c) => chamar('POST', '/api/contextos', c),
    atualizar: (id, c) => chamar('PUT', '/api/contextos/' + id, c),
    apagar: (id) => chamar('DELETE', '/api/contextos/' + id),
    // Para a análise: nunca impede a IA; se não der, segue sem contexto e explica o motivo
    async paraIA() {
      try {
        const r = await chamar('GET', '/api/contextos');
        return { contextos: r.contextos.map((c) => ({ id: c.id, titulo: c.titulo, texto: c.texto })), aviso: null };
      } catch (e) {
        return { contextos: [], aviso: e.message + ' A análise foi feita sem o Contexto da IA.' };
      }
    }
  };
})();

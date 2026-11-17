// Cenário fictício Sicoob completo (testes/amostras), lido pelos leitores reais.
import { carregar, ler } from './_carregar.mjs';

export async function cenarioSicoob(arquivoIxc = 'ixc-recebimentos.csv') {
  const L = carregar();
  const A = L.domain.analise;
  const paginas = JSON.parse(ler('testes/amostras/sicoob-francesinha.itens.json'));
  const ofx = A.leitorOfx.ler(new TextDecoder('windows-1252').decode(ler('testes/amostras/sicoob-extrato.ofx')), 'sicoob-extrato.ofx');
  const pl = await A.planilha.ler(ler('testes/amostras/' + arquivoIxc), arquivoIxc);
  const rec = A.leitorRecebimentos.interpretar(pl.abas[0].linhas, {}, arquivoIxc);
  const deteccao = A.bancos.detectar({ ofx, textoFrancesinha: A.leitorFrancesinha.textoCorrido(paginas), contasIxc: rec.contas });
  const banco = A.bancos.obter(deteccao.id);
  const fr = A.leitorFrancesinha.interpretar(paginas, banco.francesinha, 'sicoob-francesinha.pdf');
  const analise = A.motor.executar({ francesinha: fr.registros, ofx: ofx.registros, ixc: rec.registros, banco, periodoOfx: ofx.periodo });
  return { L, A, paginas, ofx, rec, fr, banco, deteccao, analise };
}

export const refsDo = (i) => [].concat(i.refs.francesinha, i.refs.ofx, i.refs.ixc).sort();

# AR Lolla — extensão para o Chrome

Painel que abre por cima da **Conciliação Manual do IXC Provedor**. Ele lê as duas grades sozinho, confere com o rodapé de totais, pareia em código e usa a IA para explicar o que sobrou. Só roda nos endereços do IXC que você cadastrar; em outros sites não faz nada.

> Use só com a **base de teste** (sem dados reais de clientes) até a liberação da empresa. A chave da API fica guardada apenas neste navegador.

## Modo Análise (versão 0.5)

No popup, **Modo Análise** abre uma guia para cruzar francesinha (PDF), extrato (OFX) e relatório de recebimentos do IXC (CSV/XLS/XLSX). Não depende da tela do IXC. Para a IA, rode o intermediário local (`npm run intermediario`): a chave fica nele, não na extensão. Os arquivos `analise.html`, `analise/`, `lib/analise/`, `lib/servicos/`, `lib/ofx.js` e `vendor/` são gerados por `npm run sincronizar` a partir do `mvp/`: não edite aqui. Detalhes em [`docs/requisitos/10-modo-analise.md`](../../docs/requisitos/10-modo-analise.md).

## Instalar (uma vez)

1. Baixe e extraia a pasta `lolla` (ou a pasta `extensao/lolla` do repositório).
2. No Chrome, abra `chrome://extensions`.
3. Ligue o **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** e escolha a pasta `lolla` (a que tem o `manifest.json`).
5. Fixe o ícone da Lolla na barra (ícone de quebra-cabeça → alfinete).

A tela de **Configurações** abre sozinha na primeira vez.

## Configurar

1. **Endereço do IXC:** com o IXC de teste aberto, copie o endereço da barra (ex.: `https://teste.seuprovedor.com.br`), cole em Configurações e clique em **Adicionar**. O Chrome pede permissão só para esse endereço.
2. **API do Claude:** cole a chave, escolha o modelo e clique em **Testar conexão**. Sem chave, a Lolla usa a IA simulada (regras locais).
3. **Contexto da IA:** com o servidor da Lolla rodando (`npm run contexto` na pasta do projeto), informe `http://127.0.0.1:3100` e clique em **Conectar**. Os contextos cadastrados na aba **Contexto da IA** do MVP (botão **Abrir o Contexto da IA**) vão junto com as sobras em cada análise, e o resultado mostra quais foram enviados. É a mesma lista do MVP. Se o servidor estiver fora do ar, a análise sai sem contexto e o painel avisa.

## Usar

1. No IXC, vá em **Financeiro → Conciliação bancária → Conciliação Manual** e filtre conta e período.
2. Aparece o botão **Lolla** no canto inferior direito. Clique para abrir o painel.
3. O painel lê a tela sozinho e se atualiza a cada mudança (filtro, conciliação, recarregar). Não precisa de botão de atualizar.
4. **Analisar sobras com IA** mostra causa, próximo passo e certeza de cada divergência.
   - **Mostrar:** destaca a linha na grade do IXC.
   - **Selecionar no IXC:** marca as caixinhas no IXC. A Lolla nunca concilia; quem concilia é você, pelo botão do IXC.
5. No topo do painel:
   - **⤢ Expandir:** o painel fica largo, com os blocos lado a lado (**⤡ Recolher** volta ao normal).
   - **↗ Guia:** abre a Lolla numa aba própria do Chrome, conectada ao IXC. Ela se atualiza sozinha; **Mostrar** e **Selecionar** levam de volta à aba do IXC. Se o IXC for recarregado, a guia reconecta sozinha.
   - **–** minimiza: o painel encolhe até o botão **Lolla**, com um estouro bem leve de gotinhas azuis.
6. **Aparência:** painel e Conciliação em vidro fosco. A Lolla acompanha sozinha o **modo escuro** do IXC (pela classe de tema da página ou pelas cores da tela). O visual da Conciliação pode ser desligado em **Visual modernizado**, no botão da barra.
7. Para **desligar**, clique no ícone da Lolla na barra e desmarque **Lolla ativa**. Para desligar de vez, use `chrome://extensions`.

## O que conferir no teste com o IXC

- A linha **"✓ Movimentação / Extrato: confere com o IXC"**: mostra se o que a Lolla leu bate com o rodapé de totais. Se aparecer ✗, mande o print: é o ajuste que falta no leitor.
- Se o botão **Lolla** não aparecer na Conciliação Manual: recarregue a página (F5). Se continuar, o IXC pode estar carregando a tela de outro endereço (iframe); veja o endereço do quadro e cadastre também.

## Testar sem o IXC

`teste/conciliacao-ixc-teste.html` imita a Conciliação Manual com dados fictícios: dá para marcar linhas, conciliar e recarregar as grades.

1. Em `chrome://extensions` → **Detalhes** da AR Lolla, ligue **Permitir acesso a URLs de arquivo**.
2. Em Configurações, adicione o endereço `file://`.
3. Abra o arquivo no Chrome (arraste para uma aba).
4. O botão **Simular modo escuro do IXC**, no topo da página, testa o tema escuro.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `manifest.json` | Definição da extensão (Manifest V3) |
| `background.js` | Registra a Lolla só nos endereços cadastrados e chama a API do Claude |
| `conteudo/leitor.js` | Lê as grades pelo atributo `abbr` e os totais do rodapé |
| `conteudo/painel.js` | Visual do painel (Shadow DOM, não mexe no estilo do IXC) |
| `conteudo/conteudo.js` | Liga/desliga, leitura automática, análise e ações |
| `lib/` | Pareamento, mascaramento, indicadores, prompts e IA simulada (os mesmos do MVP) |
| `popup.html` / `opcoes.html` | Botão da barra (liga/desliga) e Configurações |
| `guia.html` / `guia.js` | A Lolla em guia própria, ligada à aba do IXC |
| `conteudo/visual.js` | Visual modernizado da Conciliação (só aparência) e detecção do tema claro/escuro do IXC |

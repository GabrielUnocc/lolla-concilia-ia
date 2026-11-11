# 04. Arquitetura e privacidade

[← Voltar ao índice](README.md)

## Arquitetura

```
Extensão do navegador  →  Intermediário (guarda a chave da API)  →  Claude API
```

- Usa a chave de API do Claude da empresa.
- A chave **nunca** fica dentro da extensão.
- O intermediário controla quem usa e quanto gasta.

## Privacidade

- Só são enviados valor, data, documento e IDs.
- Nome e CPF/CNPJ nunca saem.
- O campo `historico` também é mascarado.
- A liberação para enviar dados de clientes à IA está [pendente com a liderança](09-pendencias-e-proximos-passos.md).

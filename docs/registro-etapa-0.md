# Registro da Etapa 0 - Baseline

Data: 2026-08-07

## Ambiente

- Node.js: `v24.19.0`
- npm: `11.17.0`
- `.env`: ausente no workspace local
- dependencias: instaladas com `npm ci`
- banco e integracoes externas: nao exercitados nesta etapa

## Alteracoes controladas

- `.npm-cache/` adicionada ao `.gitignore`;
- servidor passou a exportar `app` e `startServer`;
- importacao do servidor nao abre porta nem executa migracoes;
- execucao direta de `node server.js` preserva o startup normal;
- adicionados comandos `npm run check` e `npm test`;
- adicionada suite inicial em `test/server-baseline.test.js`.

## Resultado

```text
tests: 9
pass: 9
fail: 0
```

Cobertura inicial:

- pagina publica;
- cabecalhos de seguranca;
- bloqueio de arquivos internos;
- resposta JSON para API inexistente;
- rejeicao de origem CORS desconhecida.
- hash e verificacao de senha;
- comparacao segura de segredos;
- assinatura HMAC valida, adulterada e incompleta;
- inventario do uso atual de `localStorage` e Bearer nos dois paineis.

## Pendencias conhecidas

- testes com MySQL exigem banco exclusivo e variaveis de teste;
- Redis ainda nao foi adicionado;
- Mercado Pago, SERPRO, OpenCNPJ e SMTP ainda precisam de mocks;
- origem CORS recusada atualmente resulta em HTTP 500 e devera receber resposta controlada;
- auditoria npm encontrou cinco vulnerabilidades: uma baixa, duas moderadas e duas altas;
- as dependencias vulneraveis serao atualizadas em etapa isolada, acompanhadas de regressao.

## Comandos de verificacao

```bash
npm ci
npm run check
npm test
npm audit
```

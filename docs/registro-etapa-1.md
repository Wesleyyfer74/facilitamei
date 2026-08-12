# Registro da Etapa 1 - Rede inicial de testes

Data: 2026-08-07

## Escopo concluido

- utilitarios criptograficos expostos por uma interface de suporte a testes;
- testes de hash, salt e verificacao de senha;
- testes de comparacao segura;
- testes da assinatura HMAC do Mercado Pago;
- inventario automatizado do uso atual de `localStorage` e Bearer;
- manutencao dos testes HTTP criados na Etapa 0.

## Resultado

```text
suites: 4
tests: 9
pass: 9
fail: 0
```

## Limites desta rodada

Os testes ainda nao acessam MySQL, Redis ou servicos externos. Essa decisao impede o uso acidental de dados reais. Os proximos testes de integracao devem usar banco exclusivo, Redis de teste e mocks para Mercado Pago, SERPRO, OpenCNPJ e SMTP.

O teste de inventario do frontend confirma o comportamento inseguro atual. Durante a migracao para cookies `HttpOnly`, ele deve ser substituido por um teste que proiba `localStorage` e o cabecalho Bearer nesses paineis.

## Proxima alteracao

Concluida na Etapa 2: camada Redis, cookies `HttpOnly`, remocao de Bearer/`localStorage` e protecao CSRF.

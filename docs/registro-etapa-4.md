# Registro da Etapa 4 - CNPJ e DAS pela sessao

Data: 2026-08-07

## Alteracoes realizadas

- rota publica de vinculacao de CNPJ passou a retornar HTTP 410;
- checkout nao envia mais ID de cliente, assinatura e e-mail para alterar CNPJ;
- checkout orienta o cliente a ativar a conta e cadastrar a empresa na area autenticada;
- criada `PATCH /api/client/settings/company`;
- cliente e identificado exclusivamente por `request.clientSession.userId`;
- CNPJ passa por validacao matematica antes da consulta externa;
- primeiro cadastro e enriquecimento do mesmo CNPJ sao permitidos;
- troca para outro CNPJ e bloqueada e exige confirmacao do atendimento;
- rota publica de geracao de DAS passou a retornar HTTP 410;
- DAS autenticado usa somente `users.cnpj`, nunca o CNPJ do corpo;
- competencia do DAS exige formato `AAAAMM`;
- geracao exige cliente habilitado e pagamento aprovado ou assinatura autorizada/ativa;
- diagnostico de token SERPRO exige `ADMIN_API_KEY`;
- diagnostico SERPRO nao retorna mais nenhum trecho do token;
- area do cliente ganhou formulario autenticado de cadastro empresarial.

## Rotas

```text
PATCH /api/client/settings/company
POST  /api/client/das-mei/gerar
```

Rotas descontinuadas:

```text
POST /api/customers/cnpj
POST /api/das-mei/gerar
```

## Resultado dos testes

```text
suites: 9
tests: 29
pass: 29
fail: 0
```

Cobertura adicionada:

- matriz de autorizacao financeira do DAS;
- bloqueio das rotas publicas;
- rejeicao das rotas privadas sem cookie;
- rejeicao de token Bearer antigo;
- protecao do diagnostico SERPRO;
- ausencia do endpoint publico no checkout;
- presenca do cadastro empresarial somente no painel autenticado.

## Testes pendentes de homologacao

- cliente pago cadastra e enriquece o proprio CNPJ;
- cliente A nao altera dados do cliente B;
- tentativa de trocar um CNPJ existente recebe HTTP 409;
- cliente sem pagamento nao chama o SERPRO;
- cliente pago gera DAS e baixa apenas seu documento;
- validar competencia sem guia e respostas reais do Integra Contador.

## Proxima etapa

Fortalecer os webhooks Mercado Pago: assinatura obrigatoria para pagamentos e assinaturas, idempotencia, validacao de valor/plano e tratamento correto de falhas e retentativas.

# Registro da Etapa 7 - Consulta segura de pagamentos

Data: 2026-08-07

## Alteracoes realizadas

- consulta publica por ID Mercado Pago foi descontinuada com HTTP 410;
- Pix, boleto e cartao avulso recebem token de acompanhamento aleatorio;
- token possui 256 bits e validade de 24 horas;
- banco armazena somente SHA-256 do token;
- criada consulta publica `POST /api/payments/status` usando o token no corpo;
- criada consulta autenticada `GET /api/client/payments/:paymentId/status`;
- consulta autenticada exige `payments.user_id` igual ao usuario da sessao;
- resposta nao inclui metadata, e-mail, documento ou ID Mercado Pago;
- checkout nao inclui segredo na URL;
- polling aumenta de 8 ate 30 segundos gradualmente;
- rate limiting existente continua protegendo as consultas.

## Migracao obrigatoria

Antes de publicar esta etapa, executar:

```text
database/add-payment-status-tokens.sql
```

Colunas adicionadas:

```text
payments.status_token_hash
payments.status_token_expires_at
```

## Novas rotas

```text
POST /api/payments/status
GET  /api/client/payments/:paymentId/status
```

Rota descontinuada:

```text
GET /api/payments/:mercadoPagoId/status
```

## Resultado dos testes

```text
suites: 14
tests: 45
pass: 45
fail: 0
```

Cobertura adicionada:

- aleatoriedade e hash do token;
- validade de 24 horas;
- rota antiga retorna 410;
- token ausente ou malformado retorna 401 antes do banco;
- rota do cliente recusa cookie ausente e Bearer antigo;
- checkout usa token no corpo e nao ID na URL.

## Testes pendentes de homologacao

- executar migracao em copia do banco;
- criar Pix e receber `paymentStatusToken`;
- consultar com token valido, adulterado e expirado;
- confirmar que token de um pagamento nao acessa outro;
- cliente A nao consulta pagamento local de B;
- validar polling ate aprovacao real pelo webhook;
- validar resposta quando Mercado Pago estiver temporariamente indisponivel.

## Proxima etapa

Fortalecer upload e armazenamento de documentos: atualizar Multer, validar assinatura real, bloquear ZIP/macros e preparar armazenamento privado fora do MySQL.

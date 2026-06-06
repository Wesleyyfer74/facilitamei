# Facilita Modern - Status tecnico

Este documento resume o que ja foi preparado no sistema Facilita Modern, como o fluxo esta estruturado e quais pontos ainda precisam ser finalizados antes de producao.

## 1. Visao geral

O projeto atual fica em:

```text
C:\xampp\htdocs\Facilita\facilita-modern
```

A proposta atual e substituir a base WordPress por uma aplicacao mais controlada, com frontend proprio, backend Node/Express, banco MySQL administrado pelo phpMyAdmin e integracao com Mercado Pago para assinaturas.

O site preserva a estetica principal do site original:

- visual escuro com destaque dourado;
- cards de planos;
- imagens reaproveitadas do WordPress;
- checkout em gaveta lateral;
- fluxo de assinatura ligado ao Mercado Pago.

## 2. Frontend

Arquivos principais:

```text
index.html
styles.css
app.js
assets/
```

O frontend exibe os planos e abre uma gaveta lateral quando o cliente clica em `Assinar`.

Ponto importante de seguranca:

O frontend nao envia preco como autoridade. Ele envia apenas o ID interno do plano:

```json
{
  "planId": "premium"
}
```

O preco exibido no frontend e apenas visual. O valor real usado para criar assinatura vem do backend, consultando o banco MySQL.

IDs internos atuais dos planos:

```text
start-mei
servicos
premium
comercio
full
```

## 3. Checkout

O checkout atual funciona como uma gaveta lateral.

Campos principais:

- nome completo;
- WhatsApp;
- e-mail;
- CPF ou CNPJ;
- plano selecionado;
- dados do cartao.

Para assinaturas mensais, o fluxo principal e:

```text
Cliente escolhe plano
Frontend envia planId
Backend busca plano no banco
Backend usa mercado_pago_plan_id
Mercado Pago cria assinatura associada ao plano
Backend salva assinatura no banco
Webhook atualiza status
```

## 4. Banco de dados

O banco usado e MySQL, administravel pelo phpMyAdmin.

Arquivo de criacao:

```text
database/schema.sql
```

Banco:

```text
facilita_modern
```

### Tabela users

Armazena os clientes.

Campos principais:

```text
id
nome
email
telefone
documento
status
created_at
updated_at
```

Status possiveis:

```text
pending
active
blocked
cancelled
```

Uso:

- `pending`: cliente iniciou fluxo, mas ainda nao tem assinatura/pagamento aprovado;
- `active`: cliente liberado;
- `blocked`: pagamento recusado, vencido ou assinatura pausada/expirada;
- `cancelled`: assinatura cancelada.

### Tabela plans

Armazena os planos internos.

Campos principais:

```text
id
nome
descricao
valor
frequencia
tipo_frequencia
servico
mercado_pago_plan_id
tipo_cobranca
ativo
ordem
created_at
updated_at
```

Campo mais importante para Mercado Pago:

```text
mercado_pago_plan_id
```

Esse campo guarda o `preapproval_plan_id` retornado pelo Mercado Pago.

Planos atuais:

```text
start-mei  -> Start MEI             -> R$ 89,99/mes
servicos   -> Facilita MEI Servicos -> R$ 99,99/mes
premium    -> Facilita Premium      -> R$ 149,99/mes
comercio   -> Facilita MEI Comercio -> R$ 110,00/mes
full       -> Facilita MEI Full     -> R$ 199,99/mes
```

Todos estao configurados como:

```text
tipo_cobranca = subscription
frequencia = 1
tipo_frequencia = months
```

### Tabela subscriptions

Armazena as assinaturas dos clientes.

Campos principais:

```text
id
user_id
plan_id
mercado_pago_subscription_id
status
valor
data_inicio
data_proxima_cobranca
metodo_pagamento
init_point
raw_payload
created_at
updated_at
```

Status previstos:

```text
pending
authorized
active
paused
cancelled
expired
rejected
```

Uso:

- saber qual cliente assinou qual plano;
- saber status atual da assinatura;
- controlar data da proxima cobranca;
- bloquear ou liberar acesso conforme status.

### Tabela payments

Registra pagamentos e cobrancas mensais.

Campos principais:

```text
id
user_id
subscription_id
mercado_pago_payment_id
valor
status
data_pagamento
created_at
raw_payload
```

Uso:

- saber quem pagou;
- saber quem esta atrasado;
- auditar cobrancas;
- acompanhar eventos recebidos por webhook.

## 5. Mercado Pago

O fluxo adotado e assinatura com plano associado.

Isso significa:

```text
Plano interno
↓
Plano no Mercado Pago
↓
preapproval_plan_id
↓
plans.mercado_pago_plan_id
↓
Assinatura do cliente
```

Endpoint usado para criar plano no Mercado Pago:

```text
POST https://api.mercadopago.com/preapproval_plan
```

Endpoint usado para criar assinatura:

```text
POST https://api.mercadopago.com/preapproval
```

Na assinatura, o backend envia:

```json
{
  "preapproval_plan_id": "...",
  "card_token_id": "...",
  "status": "authorized"
}
```

Assim, valor e recorrencia ficam controlados pelo plano associado no Mercado Pago.

Contrato entre frontend e backend para assinatura por cartao:

```json
{
  "planId": "premium",
  "nome": "Joao da Silva",
  "email": "cliente@email.com",
  "telefone": "67999999999",
  "documento": "12345678900",
  "cardTokenId": "TOKEN_GERADO_PELO_MERCADO_PAGO"
}
```

O frontend nunca deve enviar numero do cartao, CVV ou validade para o backend. Esses dados sao usados apenas no navegador para gerar o `cardTokenId` com MercadoPago.js.

## 6. Planos ja criados no Mercado Pago

Os cinco planos foram criados usando o token de teste informado e os IDs foram salvos no banco.

Tabela atual:

```text
start-mei   89.99   subscription   dc3d44a153e14f5f9d1c2561f2ace154
servicos    99.99   subscription   b68b4b5a64e844299ba2d66c5c9b4058
premium     149.99  subscription   a22d80ae99784b019cd404401b5d0a32
comercio    110.00  subscription   53523a09860e4c68991d606c3ec8265d
full        199.99  subscription   761bbfc2d3f142cabdf9ceffd400f8da
```

O `back_url` desses planos tambem foi atualizado para:

```text
https://facilitameibr.com.br
```

## 7. Backend

Arquivo principal:

```text
server.js
```

Tecnologias:

```text
Node.js
Express
MySQL mysql2
Mercado Pago API
```

Scripts:

```bash
npm run dev
npm run sync:mp-plans
```

### Rotas principais

Carregar planos:

```text
GET /api/plans
```

Configuracao publica para frontend:

```text
GET /api/config
```

Criar plano no Mercado Pago:

```text
POST /api/admin/plans/:planId/mercado-pago-plan
```

Sincronizar todos os planos ativos:

```text
POST /api/admin/plans/mercado-pago/sync
```

Criar assinatura por cartao com plano associado:

```text
POST /api/subscriptions/card
```

Webhook Mercado Pago:

```text
POST /api/webhooks/mercadopago
```

Rotas antigas/alternativas ainda existem para apoio, mas o fluxo principal agora e assinatura com plano associado.

## 8. Webhook

URL de webhook para configurar no painel do Mercado Pago:

```text
https://facilitameibr.com.br/api/webhooks/mercadopago
```

O webhook recebe eventos de:

- pagamentos;
- assinaturas/preapproval.

Quando chega pagamento:

- consulta dados completos do pagamento no Mercado Pago;
- atualiza tabela `payments`;
- atualiza status do usuario.

Quando chega assinatura:

- consulta assinatura no Mercado Pago;
- atualiza tabela `subscriptions`;
- atualiza status do usuario.

## 9. Variaveis de ambiente

Arquivo local:

```text
.env
```

Exemplo:

```env
PORT=3000
SITE_URL=https://facilitameibr.com.br
MERCADO_PAGO_BACK_URL=https://facilitameibr.com.br

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=facilita_modern

MERCADO_PAGO_ACCESS_TOKEN=...
MERCADO_PAGO_PUBLIC_KEY=...
MERCADO_PAGO_WEBHOOK_SECRET=
```

Observacao:

O token informado atualmente e de teste. Antes de producao, e recomendado gerar/usar credenciais de producao e rotacionar qualquer token que tenha sido exposto em conversa ou ambiente inseguro.

## 10. Dominio configurado

Dominio definitivo informado:

```text
https://facilitameibr.com.br
```

Usado em:

- `SITE_URL`;
- `MERCADO_PAGO_BACK_URL`;
- webhook documentado;
- planos do Mercado Pago atualizados.

## 11. O que ainda falta

### Publicacao

Ainda precisa decidir onde o backend Node vai rodar em producao.

Opcoes comuns:

- VPS;
- painel com Node.js;
- Render/Railway/Fly.io;
- servidor proprio.

O dominio `https://facilitameibr.com.br` precisa apontar para onde o backend estiver hospedado.

### Mercado Pago

Falta configurar no painel:

```text
https://facilitameibr.com.br/api/webhooks/mercadopago
```

Tambem falta testar assinatura real ou de sandbox com cartao de teste.

### Public Key

Ainda precisa confirmar `MERCADO_PAGO_PUBLIC_KEY`, usada no frontend para tokenizar cartao com MercadoPago.js.

Sem essa chave, o frontend nao consegue gerar `card_token_id`.

### Painel administrativo

Ainda nao foi criado painel visual para administrar:

- usuarios;
- assinaturas;
- pagamentos;
- status pendente/pago/bloqueado/cancelado.

O banco ja esta preparado para isso.

### Regras de bloqueio

O backend ja atualiza status conforme webhook, mas ainda falta criar as telas/regras finais de acesso conforme o servico real que o cliente vai usar.

Exemplo:

```text
status active -> acesso liberado
status pending -> aguardando pagamento
status blocked -> acesso bloqueado
status cancelled -> acesso cancelado
```

## 12. Proximos comandos sugeridos

1. Confirmar se o checkout deve aceitar somente cartao recorrente ou se vamos manter alternativa Pix.
2. Informar a `MERCADO_PAGO_PUBLIC_KEY` correta.
3. Criar painel administrativo.
4. Fazer teste real de assinatura com cartao de teste.
5. Definir hospedagem do backend Node.
6. Configurar webhook no painel do Mercado Pago.
7. Publicar em `https://facilitameibr.com.br`.

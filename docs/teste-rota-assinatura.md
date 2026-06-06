# Teste da rota /api/subscriptions/card

Data do teste: 2026-06-06

## Objetivo

Validar se a rota abaixo recebe o payload correto para criar assinatura com plano associado no Mercado Pago:

```text
POST /api/subscriptions/card
```

Payload esperado:

```json
{
  "planId": "premium",
  "nome": "Cliente Teste",
  "email": "test@testuser.com",
  "telefone": "67999999999",
  "documento": "12345678909",
  "cardTokenId": "TOKEN_GERADO_PELO_MERCADO_PAGO"
}
```

## Validacoes feitas

1. Backend validado com:

```bash
node --check server.js
```

Resultado: ok.

2. Plano `premium` validado no banco:

```text
id: premium
valor: 149.99
tipo_cobranca: subscription
mercado_pago_plan_id: a22d80ae99784b019cd404401b5d0a32
```

3. Plano `premium` consultado na API do Mercado Pago:

```text
GET /preapproval_plan/a22d80ae99784b019cd404401b5d0a32
```

Resultado: HTTP 200, plano ativo.

4. Card token de teste gerado com cartao oficial de teste do Mercado Pago.

Resultado: token gerado.

5. Rota local testada:

```text
POST http://localhost:3000/api/subscriptions/card
```

Resultado: a rota existe e chega ao Mercado Pago, mas o Mercado Pago retornou:

```json
{
  "message": "Card token service not found",
  "status": 404
}
```

## Interpretacao

O backend esta buscando o plano no banco e tentando criar a assinatura com `preapproval_plan_id` e `card_token_id`.

O erro atual vem do ambiente de teste do Mercado Pago ao processar o `card_token_id` para assinatura. Esse erro e documentado pelo Mercado Pago para testes de assinaturas.

## Banco apos o teste

Como o Mercado Pago nao confirmou a assinatura, o backend nao criou registro em:

```text
users
subscriptions
```

Isso e o comportamento correto: o sistema so persiste a assinatura depois de resposta valida do Mercado Pago.

## Proximo teste necessario

Para concluir o teste com sucesso, usar:

- Public Key e Access Token do mesmo ambiente;
- token gerado pelo MercadoPago.js no frontend;
- conta de teste compradora criada no painel do Mercado Pago;
- cartao de teste oficial.

Depois de aprovado, o banco deve registrar:

```text
users:
  nome = Cliente Teste
  email = email da conta de teste
  status = pending/active

subscriptions:
  plan_id = premium
  mercado_pago_subscription_id = id retornado pelo Mercado Pago
  status = authorized/pending
  valor = 149.99
```

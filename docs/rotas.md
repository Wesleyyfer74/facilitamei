# Rotas da aplicacao

Esta e uma referencia por familia, nao um contrato OpenAPI completo. Todas as rotas mutaveis autenticadas exigem CSRF.

## Publicas

- `GET /api/plans` e `GET /api/config`;
- criacao de Pix, boleto, cartao e assinatura nas familias `/api/payments/*` e `/api/subscriptions/*`;
- `POST /api/payments/status` com token aleatorio;
- `POST /api/webhooks/mercadopago` com assinatura HMAC;
- solicitacao/confirmacao de ativacao e recuperacao do cliente;
- `GET /health/live` e `GET /health/ready`.

Rotas antigas retornam `410` e nao executam implementacao legada.

## Cliente autenticado

- login, logout e sessao em `/api/client/auth/*`;
- dashboard em `/api/client/dashboard`;
- CNPJ, endereco e dados bancarios em `/api/client/settings/*`;
- DAS em `/api/client/das-mei/gerar`;
- download de documento pertencente ao cliente;
- status de pagamento pertencente ao cliente.

## Administracao

- sessao em `/api/admin/auth/*`;
- administradores em `/api/admin/users` (owner);
- dashboard, clientes, documentos, contratos, planos, pagamentos, assinaturas, relatorios, notificacoes e configuracoes nas respectivas familias `/api/admin/*`;
- permissoes sao avaliadas pelos papeis `owner`, `finance`, `support` e `viewer`;
- operacoes mutaveis persistem auditoria sem corpo da requisicao.

## Tecnicas

- `GET /api/admin/env-check`, metricas e rotas de teste exigem `ADMIN_API_KEY` e nao devem ser expostas a usuarios finais;
- endpoints SERPRO de diagnostico exigem chave tecnica;
- CORS de producao aceita somente origens HTTPS explicitamente configuradas.

## Respostas de seguranca

- `400`: entrada invalida;
- `401`: autenticacao/assinatura invalida;
- `403`: CSRF, papel ou origem sem permissao;
- `404`: recurso inexistente ou oculto;
- `410`: rota descontinuada;
- `429`: rate limit;
- `503`: dependencia obrigatoria indisponivel.

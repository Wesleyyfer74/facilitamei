# Facilita Modern

Primeira base fora do WordPress para recriar o Facilita MEI preservando a estetica atual, agora com checkout proprio preparado para Mercado Pago.

## O que foi reaproveitado

- Logo e imagens de `wp-content/uploads`.
- Paleta escura com destaque dourado.
- Textos reais extraidos do Elementor: "Proteja seu MEI", beneficios, servicos e rodape.
- Servicos/planos encontrados: Abrir MEI, Gestao de MEI, Certificado Digital e Registro de Funcionarios para MEI.

## Checkout e Mercado Pago

1. Instale as dependencias:

```bash
npm install
```

2. Crie o arquivo `.env` a partir do modelo:

```bash
copy .env.example .env
```

3. Crie o banco no MySQL/phpMyAdmin importando:

```text
database/schema.sql
```

O schema cria o banco `facilita_modern` com as tabelas `users`, `plans`, `subscriptions` e `payments`. Os valores oficiais dos planos ficam em `plans.valor`; o frontend envia apenas `planId`.

Fluxo do banco:

- `users`: cliente, contato e status de acesso.
- `plans`: planos internos, preco, frequencia, servico e ID do plano no Mercado Pago.
- `subscriptions`: assinatura do cliente, status e proxima cobranca.
- `payments`: cobrancas mensais ou pagamentos avulsos recebidos pelo webhook.

Para planos mensais, use a opcao com plano associado do Mercado Pago:

1. Cadastre o plano interno em `plans`.
2. Crie/sincronize o plano no Mercado Pago para obter o `preapproval_plan_id`.
3. Salve esse ID em `plans.mercado_pago_plan_id`.
4. Ao criar assinatura por cartao, o backend envia `preapproval_plan_id` e `card_token_id`.

Payload esperado do frontend para assinatura por cartao:

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

O frontend gera `cardTokenId` com MercadoPago.js e nao envia dados crus do cartao para o backend.

Todos os planos iniciais estao como assinatura mensal:

```text
start-mei  -> Start MEI             -> R$ 89,99/mes
servicos   -> Facilita MEI Servicos -> R$ 99,99/mes
premium    -> Facilita Premium      -> R$ 149,99/mes
comercio   -> Facilita MEI Comercio -> R$ 110,00/mes
full       -> Facilita MEI Full     -> R$ 199,99/mes
```

Rota de apoio para criar o plano no Mercado Pago e salvar o ID:

```text
POST /api/admin/plans/:planId/mercado-pago-plan
```

Comando para criar/sincronizar todos os planos ativos do banco:

```bash
npm run sync:mp-plans
```

4. Configure a conexao MySQL no `.env`:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=facilita_modern
```

5. Quando a conta do Mercado Pago estiver criada, preencha no `.env`:

```env
MERCADO_PAGO_ACCESS_TOKEN=APP_USR_...
MERCADO_PAGO_PUBLIC_KEY=APP_USR_...
MERCADO_PAGO_WEBHOOK_SECRET=...
SITE_URL=https://facilitameibr.com.br
MERCADO_PAGO_BACK_URL=https://facilitameibr.com.br
```

6. Rode o servidor:

```bash
npm run dev
```

7. Acesse:

```text
http://localhost:3000
```

O clique em qualquer botao `Assinar` abre uma gaveta de checkout personalizado com o plano selecionado.

Regras atuais de cobranca:

- Todos os planos iniciais sao assinaturas mensais.
- A assinatura principal usa plano associado do Mercado Pago com `plans.mercado_pago_plan_id`.
- O frontend envia apenas `planId`; valor e recorrencia saem do banco e do plano associado no Mercado Pago.

No cartao, o frontend usa MercadoPago.js para gerar o token seguro antes de enviar o pagamento ao backend. No Pix automatico, o backend cria a assinatura no Mercado Pago e retorna o link de autorizacao para o cliente concluir a recorrencia.

Rotas principais:

```text
GET /api/plans
POST /api/payments/pix
POST /api/payments/card
POST /api/subscriptions/pix-auto
POST /api/subscriptions/card
POST /api/admin/plans/:planId/mercado-pago-plan
GET /api/payments/:id/status
POST /api/webhooks/mercadopago
```

Para usar webhooks em producao, configure no painel do Mercado Pago a URL:

```text
https://facilitameibr.com.br/api/webhooks/mercadopago
```

## Caminho recomendado

1. Migrar a interface para Next.js ou React/TypeScript quando as dependencias puderem ser instaladas.
2. Criar uma API segura para leads, usuarios, atendimentos, pedidos e assinaturas.
3. Usar Postgres ou MySQL com migrations, sem depender de tabelas do WordPress.
4. Importar conteudo do banco `wp_facilitamei.sql`, mantendo paginas institucionais e politicas.
5. Remover credenciais do dump antes de versionar ou enviar para qualquer ambiente.

## Como abrir

Para ver apenas a pagina estatica, abra `index.html` no navegador ou acesse pelo XAMPP em:

`http://localhost/Facilita/facilita-modern/`

Para testar o checkout, use o servidor Node em `http://localhost:3000`.

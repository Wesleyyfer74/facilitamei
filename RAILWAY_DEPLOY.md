# Deploy Railway - Backend

Use este guia para rodar o backend Node.js no Railway enquanto o frontend fica na Hostinger.

## URLs

```text
Frontend: https://facilitameibr.com.br
Backend:  https://SEU-BACKEND.up.railway.app
```

## Arquivos Para Railway

Suba o projeto com:

```text
server.js
package.json
package-lock.json
database/
scripts/
assets/
index.html
app.js
styles.css
config.js
```

Nao suba:

```text
node_modules/
backend.log
dev-server.log
dev-server.err
.tmp-card-token.txt
.env
```

## Variaveis

Configure no Railway:

```env
NODE_ENV=production
FRONTEND_URL=https://facilitameibr.com.br
SITE_URL=https://facilitameibr.com.br
API_PUBLIC_URL=https://SEU-BACKEND.up.railway.app
MERCADO_PAGO_BACK_URL=https://facilitameibr.com.br

DB_HOST=HOST_DO_MYSQL
DB_PORT=3306
DB_USER=USUARIO_DO_BANCO
DB_PASSWORD=SENHA_DO_BANCO
DB_NAME=NOME_DO_BANCO

MERCADO_PAGO_ACCESS_TOKEN=SEU_ACCESS_TOKEN
MERCADO_PAGO_PUBLIC_KEY=SUA_PUBLIC_KEY
MERCADO_PAGO_WEBHOOK_SECRET=SEU_WEBHOOK_SECRET
ADMIN_API_KEY=CRIE_UMA_CHAVE_FORTE
```

## Comandos

```bash
npm install
npm start
```

## Mercado Pago

Configure o webhook:

```text
https://SEU-BACKEND.up.railway.app/api/webhooks/mercadopago
```

Eventos:

```text
payment
preapproval
subscription_preapproval
```

Depois de configurar banco e credenciais, sincronize os planos:

```bash
npm run sync:mp-plans
```

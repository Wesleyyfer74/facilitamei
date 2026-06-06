# Deploy Hostinger - Frontend

Use este guia quando o frontend ficar direto em `public_html` e o backend ficar no Railway.

## O Que Subir

Suba para `public_html`:

```text
index.html
app.js
styles.css
config.js
.htaccess
assets/
```

Antes de subir, edite `config.js`:

```js
window.FACILITA_API_BASE = "https://SEU-BACKEND.up.railway.app";
```

Nao suba para Hostinger:

```text
server.js
package.json
package-lock.json
node_modules/
database/
scripts/
docs/
backend.log
dev-server.log
dev-server.err
.env
```

O webhook do Mercado Pago deve apontar para o Railway:

```text
https://SEU-BACKEND.up.railway.app/api/webhooks/mercadopago
```

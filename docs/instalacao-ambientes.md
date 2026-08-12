# Instalacao e ambientes

## Requisitos

- Node.js 24;
- MySQL 8;
- Redis;
- em producao/homologacao: bucket S3 privado e ClamAV.

## Desenvolvimento

1. Copiar `.env.example` para `.env` e trocar `NODE_ENV` para `development`.
2. Configurar MySQL local e, preferencialmente, Redis local.
3. Para um banco vazio, executar `npm run db:migrate`.
4. Instalar e validar:

```powershell
npm ci
npm run check
npm run lint
npm test
npm run dev
```

Sem Redis, storage ou antivirus, os fallbacks em memoria/local so sao permitidos fora de producao.

## Homologacao e producao

Use projetos, bancos, Redis, buckets e credenciais diferentes. Configure todas as variaveis de `.env.example` no gerenciador de segredos. URLs devem usar HTTPS e frontend/API devem compartilhar a origem oficial.

Gere a chave de dados fora do repositorio:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Para o primeiro administrador, configure temporariamente `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD` e um segredo TOTP Base32, execute `npm run admin:bootstrap` e remova as tres variaveis.

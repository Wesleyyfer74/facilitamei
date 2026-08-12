# Facilita MEI

Aplicacao Node.js/Express com site publico, checkout, area do cliente e painel administrativo. Usa MySQL, Redis, Mercado Pago, SERPRO, SMTP, storage S3 privado e ClamAV.

## Comecar

Requisitos: Node.js 24, MySQL 8 e Redis.

```powershell
npm ci
npm run db:migrate
npm run check
npm run lint
npm test
npm run dev
```

Antes, copie `.env.example` para `.env`, use `NODE_ENV=development` e configure servicos locais. Nunca commite `.env`, certificados ou chaves.

URLs locais padrao:

- site: `http://localhost:3000/`;
- cliente: `http://localhost:3000/cliente/`;
- admin: `http://localhost:3000/admin/`;
- health: `http://localhost:3000/health/live`.

## Comandos

- `npm run check`: sintaxe dos arquivos principais;
- `npm run lint`: ESLint;
- `npm test`: suite automatizada;
- `npm run dev:test`: inicia com `.env.test`, sem ler o ambiente principal;
- `npm run format`: formatacao explicita com Prettier;
- `npm run db:migrate`: migracoes versionadas;
- `npm run db:verify`: verifica schema sem alterar;
- `npm run admin:bootstrap`: cria o primeiro owner com MFA;
- `npm run db:encrypt-legacy`: criptografa dados bancarios antigos;
- `npm run migrate:documents-storage`: migra Base64 para storage privado;
- `npm run db:purge-expired`: aplica retencao operacional.

Comandos que alteram dados exigem backup e homologacao.

## Documentacao

- [Status atual](docs/status-tecnico.md)
- [Arquitetura](docs/arquitetura.md)
- [Instalacao e ambientes](docs/instalacao-ambientes.md)
- [Rotas](docs/rotas.md)
- [Deploy e rollback](docs/deploy-rollback.md)
- [Homologacao integrada](docs/homologacao.md)
- [Plano de seguranca](docs/plano-seguranca-producao.md)

Os arquivos `docs/registro-etapa-*.md` preservam o historico das melhorias de seguranca.

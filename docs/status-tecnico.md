# Facilita MEI - Status tecnico atual

Atualizado em 10/08/2026. Este documento substitui o status legado que ainda indicava o painel administrativo e a hospedagem como pendentes.

## Estado atual

O projeto usa frontend HTML/CSS/JavaScript e backend Node.js/Express, com MySQL, Redis, armazenamento privado S3, ClamAV, Mercado Pago, SMTP e SERPRO. Em producao, o Node serve site, `/admin/`, `/cliente/`, arquivos estaticos e API no mesmo dominio HTTPS.

Diretorio local atual:

```text
C:\xampp\htdocs\projetos\facilitamei
```

Dominio de producao planejado:

```text
https://facilitameibr.com.br
```

## Interfaces

- `/`: site e checkout.
- `/cliente/`: painel autenticado do cliente.
- `/admin/`: painel administrativo completo para clientes, planos, pagamentos, contratos, documentos, relatorios e configuracoes.
- `/health/live`: processo HTTP ativo.
- `/health/ready`: MySQL e Redis prontos.

O frontend usa `window.location.origin`; nao existe URL Railway fixa no codigo.

## Seguranca implementada

- sessoes por cookie `HttpOnly`, `Secure` em producao, CSRF e Redis;
- nenhuma sessao/token em `localStorage`;
- rate limiting distribuido;
- CNPJ e DAS vinculados ao cliente autenticado e financeiramente habilitado;
- status de pagamento por token aleatorio ou sessao proprietaria;
- webhook Mercado Pago assinado, idempotente e com validacao do recurso;
- uploads por assinatura binaria, ClamAV e bucket privado;
- dados bancarios com AES-256-GCM e chave externa;
- payloads de gateway minimizados e politica de retencao;
- administradores persistidos, senha scrypt, TOTP, papeis e auditoria;
- logs estruturados com request ID e mascaramento de dados pessoais;
- configuracao de producao validada antes de abrir a porta.

## Banco e migracoes

`database/railway-schema.sql` e o baseline 001. Alteracoes posteriores ficam em `database/migrations/` e sao registradas em `schema_migrations` com checksum. Instancias web nao alteram schema.

Comandos:

```powershell
npm run db:migrate
npm run db:verify
npm run db:encrypt-legacy
npm run migrate:documents-storage
npm run db:purge-expired
```

Migracoes e scripts que alteram dados devem ser usados somente depois de backup e teste de restauracao em homologacao.

## Qualidade

```powershell
npm ci
npm run check
npm run lint
npm test
npm audit --audit-level=high
```

O GitHub Actions executa essas verificacoes no Node 24. Na ultima validacao local havia 65 testes aprovados, lint sem avisos e auditoria npm sem vulnerabilidades conhecidas.

## Pendencias externas antes da producao

- criar recursos separados de homologacao e producao;
- configurar DNS e dominio personalizado no Railway;
- aplicar migracoes em clone anonimizado e testar restauracao;
- configurar bucket privado, ClamAV e Redis reais;
- criar o primeiro `owner` e remover variaveis de bootstrap;
- testar SMTP real e sandbox Mercado Pago (Pix, boleto, cartao, assinatura, cancelamento e webhook);
- testar SERPRO com certificado/credenciais de homologacao;
- conectar health, metricas e alertas ao monitor escolhido;
- aprovar prazos definitivos de retencao com responsavel LGPD.

## Referencias

- [Arquitetura](arquitetura.md)
- [Instalacao e ambientes](instalacao-ambientes.md)
- [Deploy e rollback](deploy-rollback.md)
- [Plano de seguranca](plano-seguranca-producao.md)
- Registros das etapas 0 a 13 neste diretorio.

# Deploy e rollback

## Deploy em homologacao

1. Registrar commit/revisao e gerar snapshot MySQL restauravel.
2. Confirmar Redis, S3, ClamAV e credenciais sandbox.
3. Executar `npm ci` e a pipeline completa.
4. O pre-deploy Railway executa `npm run db:migrate && npm run db:verify`.
5. Quando aplicavel, executar manualmente e com backup:
   - `npm run db:encrypt-legacy`;
   - `npm run migrate:documents-storage`.
6. Validar health, site, cliente, admin, MFA, papeis e auditoria.
7. Validar SMTP, SERPRO e todos os fluxos Mercado Pago sandbox.
8. Promover exatamente a mesma revisao para producao.

## Rollback

1. Interromper novas alteracoes e registrar request IDs/horario.
2. Reverter a aplicacao para a ultima revisao aprovada no Railway.
3. Nao editar nem apagar registros de `schema_migrations` manualmente.
4. Se a versao anterior nao aceitar o schema novo, restaurar o snapshot em instancia separada e validar antes de trocar conexoes.
5. Executar `/health/ready`, login, checkout e consulta do cliente.
6. Registrar causa, impacto e acao corretiva.

DDL MySQL pode efetuar commit implicito. Portanto, recuperacao de migracao depende de snapshot testado, nao de rollback automatico prometido pelo aplicativo.

## Checklist rapido

- [ ] backup restaurado em ambiente separado;
- [ ] migracoes e `db:verify` aprovados;
- [ ] 0 vulnerabilidades altas aplicaveis;
- [ ] cookies Secure e CORS oficial;
- [ ] Redis, S3 e ClamAV prontos;
- [ ] owner com MFA e variaveis de bootstrap removidas;
- [ ] webhook assinado e idempotente;
- [ ] alertas/health monitorados;
- [ ] plano de rollback e responsavel definidos.

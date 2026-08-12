# Homologacao integrada

Use recursos exclusivos e dados ficticios/anonimizados. Nunca aponte homologacao para banco, Redis, bucket, credenciais Mercado Pago ou SERPRO de producao.

## Preflight

O workspace possui `.env.test`, ignorado pelo Git, com valores ficticios e nomes isolados (`facilita_modern_test`, Redis DB 15 e bucket de teste). Substitua somente pelos recursos de homologacao. Nunca copie valores do `.env` de producao.

O comando local valida arquivos e variaveis sem abrir conexoes externas:

```powershell
npm run homologation:preflight
```

Com `.env` de homologacao configurado, o modo externo testa apenas conectividade:

```powershell
npm run homologation:preflight:test
npm run homologation:preflight:external
```

Ele executa `SELECT 1`, Redis `PING`, `HeadBucket`, scan inofensivo no ClamAV, `SMTP verify` sem envio e `GET /health/ready`. Nao cria cobranca, nao envia e-mail, nao consulta CNPJ/DAS e nao grava objeto.

Para iniciar a aplicacao usando explicitamente o arquivo separado:

```powershell
npm run dev:test
```

Esse comando requer MySQL, Redis, MinIO/S3 e ClamAV de teste disponíveis. A suite unitária normal continua sendo `npm test` e nao depende desses servicos.

## Gate completo

1. Restaurar backup anonimizado em banco separado.
2. Executar `npm run db:migrate` e `npm run db:verify`.
3. Executar check, lint, testes e auditoria.
4. Criar owner de homologacao com TOTP.
5. Validar os quatro papeis e auditoria.
6. Enviar e-mail para caixa de teste controlada.
7. Testar Pix, boleto, cartao, assinatura, cancelamento e webhook no sandbox Mercado Pago.
8. Consultar apenas CNPJ de teste autorizado e gerar DAS somente quando permitido pelo ambiente SERPRO.
9. Testar upload limpo, arquivo malicioso de teste EICAR, acesso cruzado e download privado.
10. Simular indisponibilidade de MySQL, Redis, ClamAV e webhook de alerta.
11. Restaurar novamente o backup para comprovar o procedimento de recuperacao.

Promocao para producao exige evidencias, responsavel e horario de rollback definidos.

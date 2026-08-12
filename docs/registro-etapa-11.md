# Etapa 11 - Migracoes e protecao do banco

## Fonte de verdade

`database/railway-schema.sql` e o baseline congelado (versao 001). Toda alteracao posterior deve ser um arquivo numerado e imutavel em `database/migrations/`. `database/schema.sql` representa o snapshot corrente para consulta local, mas nao e executado pelo deploy.

## Migracoes

- `npm run db:migrate` cria `schema_migrations`, obtem trava MySQL exclusiva e aplica arquivos pendentes em ordem.
- Cada migracao possui SHA-256. Alterar um arquivo ja aplicado interrompe o processo.
- Banco vazio recebe o baseline; banco existente registra o baseline e segue pelas migracoes numeradas.
- Railway executa `db:migrate` e `db:verify` antes de iniciar a aplicacao.
- Instancias web nao executam `CREATE TABLE` nem `ALTER TABLE`.

Migracoes atuais:

- 002: amplia campos bancarios para AES-256-GCM.
- 003: adiciona indices para pagamentos, assinaturas, documentos, contratos, e-mails e webhooks.

## Dados sensiveis

- Novos dados bancarios usam AES-256-GCM e IV aleatorio.
- A chave de 32 bytes em Base64 vem de `DATA_ENCRYPTION_KEY` e deve ficar no gerenciador de segredos.
- Leitura de valores antigos em texto continua temporariamente disponivel.
- Depois de backup e migracao 002, executar `npm run db:encrypt-legacy`. O comando e retomavel.
- Payloads Mercado Pago agora retêm somente identificadores, status, datas, metodo, valor e referencias de plano; dados completos do pagador nao sao persistidos.

## Retencao LGPD

`npm run db:purge-expired` remove tokens, logs e eventos operacionais antigos e limpa payloads conforme `OPERATIONAL_DATA_RETENTION_DAYS` (365) e `PAYMENT_PAYLOAD_RETENTION_DAYS` (90). O comando deve rodar como job isolado. Os prazos definitivos dependem de aprovacao juridica/LGPD.

## Backup, restauracao e recuperacao

Antes de migrar:

1. gerar snapshot consistente e registrar horario/versao;
2. restaurar em banco separado de homologacao;
3. executar `db:migrate`, `db:encrypt-legacy` quando aplicavel e `db:verify`;
4. executar testes e fluxos de login, checkout, admin e cliente;
5. somente entao migrar producao.

DDL MySQL pode efetuar commit implicito. Uma migracao que falha nao e registrada; a recuperacao deve corrigir a causa ou restaurar o snapshot, nunca editar uma migracao ja aplicada.

## Transacoes

O cadastro administrativo conjunto de cliente/assinatura e os trabalhos de retencao usam transacao e rollback. Novas operacoes multi-registro devem usar uma unica conexao. Chamadas externas ao Mercado Pago devem ficar fora de transacoes longas.

## Validacao externa pendente

Testes de banco vazio, atualizacao do clone atual e restauracao exigem uma instancia MySQL descartavel com copia anonimizada. Os scripts nao foram executados contra dados reais nesta etapa.

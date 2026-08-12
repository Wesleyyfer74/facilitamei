# Arquitetura

## Componentes

```text
Navegador
  -> Railway/Express (site, cliente, admin e API)
      -> MySQL (dados de negocio, migracoes e auditoria)
      -> Redis (sessoes e rate limiting)
      -> S3 privado (documentos)
      -> ClamAV (inspecao de uploads)
      -> Mercado Pago (pagamentos e webhooks)
      -> SERPRO (CNPJ/DAS)
      -> SMTP (ativacao, recuperacao e notificacoes)
      -> Webhook de alertas/monitoramento
```

## Codigo

- `server.js`: composicao HTTP e rotas; vem sendo reduzido gradualmente.
- `src/services/`: autenticacao, criptografia, storage, antivirus, sessoes, rate limit, alertas, metricas, logs, SERPRO e migracoes.
- `admin/`, `cliente/`, `index.html`, `app.js`, `styles.css`: interfaces.
- `database/railway-schema.sql`: baseline.
- `database/migrations/`: evolucao versionada.
- `scripts/`: operacoes explicitas de banco e integracoes.
- `test/`: testes unitarios, HTTP e inventarios de seguranca.

## Limites de confianca

O navegador nunca e autoridade para preco, CNPJ, MIME, status financeiro ou papel. O backend valida sessao, CSRF, propriedade, plano no banco, assinatura do arquivo e resposta oficial do provedor. Segredos permanecem no ambiente do servidor.

## Dados

Documentos ficam fora da pasta publica e do MySQL. O banco guarda chave privada, hash e metadados. Campos bancarios sao criptografados na aplicacao. Logs e alertas nao recebem corpo da requisicao e mascaram identificadores pessoais.

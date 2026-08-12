# Etapa 12 - Operacao, observabilidade e administracao

## Administracao

- Producao autentica pela tabela `admin_users`; a senha global do ambiente fica restrita ao desenvolvimento/testes.
- Senhas usam scrypt e salt individual.
- TOTP de seis digitos e obrigatorio em producao; o segredo fica criptografado com a chave externa de dados.
- Papeis: `owner`, `finance`, `support` e `viewer`, com menor privilegio por metodo e recurso.
- `owner` pode listar e criar administradores pela API protegida `/api/admin/users`.
- O primeiro owner e criado por `npm run admin:bootstrap`; variaveis `ADMIN_BOOTSTRAP_*` devem ser removidas imediatamente.
- Acoes administrativas mutaveis geram registro em `admin_audit_logs`, incluindo responsavel, request ID, recurso, resultado e hash do IP, sem corpo da requisicao.

## Observabilidade

- Toda resposta recebe `X-Request-Id` e gera log JSON com metodo, caminho, status e duracao.
- Chaves e textos sensiveis mascaram senhas, tokens, cookies, e-mail, CPF/CNPJ, telefone e dados bancarios.
- Contadores HTTP e uptime ficam disponiveis em `/api/admin/metrics` mediante chave tecnica.
- Falhas nao tratadas e readiness indisponivel podem ser enviadas ao `ALERT_WEBHOOK_URL`; alerta sem destino falha de forma segura.
- Health checks da etapa anterior continuam sendo a fonte do monitoramento de disponibilidade.

## Qualidade e CI

- ESLint e Prettier foram adicionados.
- O lint identificou e permitiu remover o corpo inalcançavel da rota antiga `/api/subscription`.
- GitHub Actions executa `npm ci`, sintaxe, lint, testes, auditoria e validacao sintatica das migracoes no Node 24.
- A separacao gradual retirou do arquivo principal autenticacao administrativa, TOTP/papeis, criptografia, logs, alertas, metricas, storage, sessoes, rate limit e migracoes para servicos dedicados.

## Incidentes e rotacao

1. Isolar homologacao/producao e registrar request IDs afetados.
2. Revogar sessoes no Redis e desativar o administrador comprometido.
3. Rotacionar segredos no provedor: Mercado Pago, SERPRO, SMTP, Redis, banco, S3 e alertas.
4. Para `DATA_ENCRYPTION_KEY`, executar rotacao planejada: manter a chave antiga em processo offline, descriptografar e recriptografar para a nova chave, validar amostra e somente depois remover a antiga.
5. Consultar `admin_audit_logs`, webhooks e logs estruturados sem exportar dados pessoais desnecessarios.
6. Restaurar snapshot verificado se houver corrupcao e executar `db:migrate`/`db:verify`.
7. Documentar causa, impacto, correcoes e prazo de retencao das evidencias.

## Validacoes externas pendentes

- Configurar destino real de alertas e simular falhas em homologacao.
- Criar ao menos um usuario para cada papel e validar a interface completa.
- Integrar o endpoint de metricas/health ao monitor escolhido.
- Exercitar rotacao de chave e restauracao em copia anonimizada.

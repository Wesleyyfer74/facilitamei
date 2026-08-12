# Plano de seguranca, estabilizacao e producao

## 1. Objetivo

Este documento organiza as alteracoes necessarias para preparar o Facilita MEI para producao. A execucao sera incremental: uma etapa por vez, com testes antes de iniciar a etapa seguinte.

Nenhuma etapa deve misturar refatoracao ampla com mudanca de seguranca. Cada etapa deve gerar um conjunto pequeno de alteracoes, evidencias de teste e um ponto simples de rollback.

## 2. Decisoes confirmadas

### DAS-MEI

O fluxo correto e:

1. o cliente conclui o pagamento ou possui assinatura valida;
2. entra na area do cliente com sessao autenticada;
3. solicita o DAS;
4. o backend obtem o `user_id` pela sessao;
5. o backend le o CNPJ diretamente do cadastro desse usuario;
6. o CNPJ nunca e aceito como autoridade a partir do corpo da requisicao;
7. o documento gerado e salvo e disponibilizado somente ao mesmo cliente.

A rota autenticada `/api/client/das-mei/gerar` segue a direcao correta. A rota publica `/api/das-mei/gerar` deve ser removida de producao ou limitada a ambiente de desenvolvimento e autenticacao administrativa.

Antes de gerar o DAS, o backend tambem deve confirmar:

- usuario ativo;
- `cliente_login_ativo = 1`;
- pagamento aprovado ou assinatura em estado permitido;
- CNPJ valido e pertencente ao cadastro da sessao.

### SERPRO e consulta de CNPJ

A consulta cadastral de CNPJ usa OpenCNPJ/CNPJ.ws. A autenticacao SERPRO e usada no fluxo do Integra Contador/DAS, nao precisa ser exposta ao navegador para consultar CNPJ.

O endpoint `/api/serpro/token/teste` e uma ferramenta de diagnostico. Ele devera:

- ficar indisponivel em producao; ou
- exigir sessao administrativa e uma flag explicita de diagnostico;
- nunca retornar token completo nem parcial;
- retornar apenas estado da integracao, duracao e codigo seguro de erro;
- receber rate limiting proprio.

### Cadastro e alteracao de CNPJ

A vinculacao ou alteracao de CNPJ sera feita somente por sessao autenticada. O backend identifica o cliente pela sessao e ignora `customerId`, `userId`, `subscriptionId` e e-mail enviados como autoridade pelo navegador.

### Modelo de implantacao

O alvo recomendado e uma unica aplicacao Node/Express no dominio oficial, servindo frontend e API na mesma origem:

```text
https://facilitameibr.com.br/
https://facilitameibr.com.br/admin/
https://facilitameibr.com.br/cliente/
https://facilitameibr.com.br/api/...
```

O dominio pode apontar para o Railway por dominio personalizado. Isso elimina a URL Railway fixa do frontend, reduz problemas de CORS e faz cookies `HttpOnly` funcionarem de forma consistente.

## 3. Ordem de execucao

### Etapa 0 - Baseline e protecao do trabalho atual

Objetivo: criar uma referencia confiavel antes das mudancas.

Alteracoes:

- revisar e separar as alteracoes locais existentes;
- garantir que `.env`, certificados e arquivos privados estejam ignorados;
- inspecionar o conteudo de `public_html.zip` antes de decidir se deve ser arquivado fora do projeto;
- instalar dependencias de forma reproduzivel com `npm ci`;
- registrar versoes de Node, npm, MySQL e ambiente de producao;
- criar uma branch ou commit de baseline somente depois de revisar as mudancas locais.

Testes:

- `node --check` em todos os arquivos JavaScript;
- inicializacao local com banco de teste;
- acesso ao site, admin e cliente;
- copia ou backup do banco de desenvolvimento.

Criterio de aceite: sistema atual inicializa e os fluxos existentes foram registrados antes de qualquer mudanca funcional.

### Etapa 1 - Testes automatizados essenciais

Objetivo: proteger os fluxos que serao modificados.

Alteracoes:

- adicionar framework de testes;
- separar a criacao do `app` da chamada `listen`;
- permitir banco e Redis exclusivos de teste;
- criar fixtures sem dados pessoais reais;
- simular Mercado Pago, SERPRO, OpenCNPJ e SMTP.

Testes minimos:

- login, logout, expiracao e revogacao de sessao;
- ativacao e recuperacao de acesso;
- autorizacao por cliente em documentos e dados cadastrais;
- DAS usando apenas o CNPJ da sessao;
- webhook valido, invalido, duplicado e fora de ordem;
- consulta de pagamento pelo cliente correto e por outro cliente;
- upload permitido, arquivo disfarçado, arquivo grande e ZIP;
- rotas administrativas sem autenticacao.

Criterio de aceite: testes executados por um unico comando e sem chamadas reais a servicos externos.

### Etapa 2 - Redis e sessoes seguras por cookie

Objetivo: retirar sessoes da memoria e tokens do `localStorage`.

Alteracoes:

- adicionar Redis e cliente Redis;
- armazenar apenas identificador opaco de sessao no cookie;
- criar sessoes administrativas e de cliente com TTL no Redis;
- usar cookies `HttpOnly`, `Secure` em producao e `SameSite=Lax` ou `Strict` conforme o fluxo;
- rotacionar o ID da sessao depois do login;
- revogar a sessao no logout, bloqueio, cancelamento e troca de senha;
- remover retorno de token no JSON de login;
- remover leitura e escrita de token no `localStorage` de admin e cliente;
- usar `credentials: "include"` nas requisicoes do frontend quando necessario;
- falhar de forma segura se o Redis estiver indisponivel.

Protecao CSRF:

- aceitar requisicoes mutaveis apenas da origem oficial;
- validar `Origin` e, quando aplicavel, `Referer`;
- adicionar token CSRF para `POST`, `PATCH` e `DELETE` autenticados;
- webhooks externos ficam fora do middleware CSRF e usam assinatura do provedor.

Testes:

- cookie nao acessivel por JavaScript;
- nenhuma chave de sessao no `localStorage`;
- sessao compartilhada entre duas instancias da aplicacao;
- reinicio do Node nao encerra sessoes validas;
- logout e troca de senha revogam a sessao;
- requisicao de outra origem e CSRF sem token sao recusados.

Criterio de aceite: nenhum token de admin ou cliente fica disponivel ao JavaScript e todas as instancias usam Redis.

### Etapa 3 - Cadastro, ativacao e recuperacao de senha

Objetivo: impedir tomada de conta usando apenas e-mail e documento.

Alteracoes:

- substituir o setup direto por token unico enviado ao e-mail cadastrado;
- armazenar somente o hash do token, com validade curta e uso unico;
- impedir setup quando o cliente ja possui senha;
- criar fluxo separado de recuperacao de senha;
- resposta neutra para e-mails inexistentes, evitando enumeracao;
- exigir senha forte e limitar tentativas;
- revogar todas as sessoes depois da redefinicao;
- registrar evento de seguranca sem gravar senha ou token.

Testes:

- token valido, expirado, reutilizado e adulterado;
- tentativa com e-mail ou documento de outro cliente;
- setup repetido;
- enumeracao de e-mails;
- revogacao das sessoes anteriores.

Criterio de aceite: conhecer e-mail e CPF/CNPJ nao e suficiente para alterar a senha.

### Etapa 4 - CNPJ e DAS vinculados a sessao

Objetivo: garantir isolamento completo entre clientes.

Alteracoes:

- substituir a rota publica de vinculacao por rota autenticada, por exemplo `PATCH /api/client/settings/company`;
- obter `user_id` exclusivamente da sessao;
- validar CNPJ e registrar data/origem da alteracao;
- exigir reautenticacao ou confirmacao por e-mail para trocar um CNPJ ja cadastrado;
- manter `/api/client/das-mei/gerar` como unico fluxo de cliente;
- retirar `/api/das-mei/gerar` de producao;
- verificar acesso financeiro antes da chamada ao SERPRO;
- impedir que o corpo da requisicao escolha outro CNPJ;
- manter download do DAS restrito ao proprietario.

Testes:

- cliente ativo e pago gera seu DAS;
- cliente sem pagamento e bloqueado;
- CNPJ enviado no corpo e ignorado ou recusado;
- cliente A nao gera nem baixa documento do cliente B;
- troca de CNPJ exige confirmacao;
- rota publica nao existe em producao.

Criterio de aceite: o CNPJ usado pelo SERPRO sempre vem do usuario autenticado e autorizado.

### Etapa 5 - Webhooks Mercado Pago

Objetivo: autenticar, tornar idempotentes e tornar auditaveis todos os eventos.

Alteracoes:

- validar `x-signature` e `x-request-id` para pagamentos e assinaturas;
- rejeitar assinatura ausente, malformada ou invalida;
- consultar o objeto na API oficial antes de alterar o banco;
- conferir conta, `external_reference`, metadata, plano, valor e moeda;
- registrar ID unico do evento ou combinacao idempotente;
- impedir duplicidade de pagamentos e efeitos repetidos;
- tratar eventos fora de ordem sem regredir um estado final valido;
- responder rapidamente ao Mercado Pago e processar trabalho demorado em fila;
- devolver erro recuperavel quando o processamento falhar, em vez de sempre responder `200`;
- remover dados pessoais e payloads completos dos logs de aplicacao.

Testes:

- assinatura valida e invalida para cada tipo de evento;
- webhook repetido;
- pagamento com valor ou plano divergente;
- evento antigo depois de evento novo;
- indisponibilidade temporaria do banco e retentativa.

Criterio de aceite: webhook falso nao altera dados e webhook repetido nao duplica efeitos.

### Etapa 6 - Rate limiting e protecao contra abuso

Objetivo: proteger autenticacao, integracoes externas e operacoes caras.

Usar Redis como armazenamento dos contadores para funcionar com varias instancias.

Politicas iniciais, sujeitas a ajuste por monitoramento:

| Grupo | Limite inicial |
|---|---:|
| Login admin | 5 tentativas por 15 minutos por IP e identificador |
| Login/ativacao/recuperacao cliente | 5 tentativas por 15 minutos por IP e identificador |
| Consulta publica de CNPJ | 10 por minuto por IP |
| DAS-MEI autenticado | 3 por hora por cliente e competencia |
| Criacao de pagamento/assinatura | 5 por 10 minutos por sessao e IP |
| Status de pagamento | 30 por minuto por sessao |
| Webhook | limite alto por IP, mantendo validacao criptografica |
| Rotas gerais da API | 120 por minuto por IP |

Alteracoes adicionais:

- atraso progressivo ou bloqueio temporario no login;
- limites de tamanho para JSON e formularios;
- timeout e circuit breaker para APIs externas;
- mensagens `429` consistentes;
- permitir proxies confiaveis apenas quando configurados corretamente.

Testes:

- limite por IP e por conta;
- contadores compartilhados entre instancias;
- liberacao depois do periodo;
- webhook legitimo em rajada controlada;
- cabecalhos e resposta `429`.

Criterio de aceite: tentativas excessivas sao bloqueadas sem impedir o uso normal.

### Etapa 7 - Consulta segura de status de pagamento

Objetivo: impedir enumeracao de IDs e consultas em nome de terceiros.

Alteracoes:

- remover a rota publica `GET /api/payments/:id/status`;
- disponibilizar status dentro da sessao do cliente;
- consultar primeiro o pagamento local por `id` e `user_id` da sessao;
- usar identificador publico aleatorio se o checkout precisar acompanhar pagamento antes do login;
- armazenar hash do token de acompanhamento com expiracao curta;
- nunca aceitar somente o ID sequencial/local ou ID Mercado Pago como autorizacao;
- limitar polling e orientar o frontend a aumentar o intervalo gradualmente.

Testes:

- cliente acessa seu pagamento;
- cliente A nao acessa pagamento de B;
- ID aleatorio ou Mercado Pago sem sessao/token e recusado;
- token de acompanhamento expira;
- polling excessivo recebe `429`.

Criterio de aceite: nenhum status e revelado apenas pelo conhecimento do ID do pagamento.

### Etapa 8 - Upload e armazenamento de documentos

Objetivo: impedir arquivos maliciosos e reduzir o peso do MySQL.

Alteracoes:

- atualizar Multer antes de manter uploads ativos;
- validar magic bytes, extensao e MIME conjuntamente;
- renomear arquivos com ID aleatorio;
- bloquear macros e formatos ativos;
- remover ZIP da lista inicialmente; reativar somente com inspecao segura;
- integrar antivirus, por exemplo ClamAV, antes de liberar o arquivo;
- armazenar arquivos em bucket privado compativel com S3;
- guardar no MySQL apenas metadados, hash, tamanho e chave do objeto;
- fornecer downloads por backend autorizado ou URL assinada curta;
- criptografar armazenamento e definir politica de retencao/exclusao LGPD;
- migrar Base64 existente em lote, com verificacao de hash e rollback.

Testes:

- PDF real e PDF falso;
- executavel renomeado;
- arquivo com macro;
- arquivo acima do limite;
- ZIP bloqueado;
- cliente A nao baixa arquivo de B;
- objeto privado nao abre por URL permanente.

Criterio de aceite: somente arquivos inspecionados chegam ao armazenamento privado.

### Etapa 9 - Atualizacao de dependencias

Objetivo: eliminar vulnerabilidades conhecidas sem quebrar integracoes.

Ordem:

1. criar branch isolada;
2. executar `npm ci` e registrar auditoria inicial;
3. atualizar Multer e dependencias compativeis;
4. atualizar Nodemailer e testar SMTP;
5. atualizar SDK Mercado Pago e adaptar chamadas quebradas;
6. executar testes completos e nova auditoria;
7. revisar changelogs antes do deploy.

Nao usar `npm audit fix --force` diretamente em producao.

Testes:

- upload;
- e-mail real em ambiente de homologacao;
- Pix, boleto, cartao, assinatura, cancelamento e webhook no sandbox;
- `npm audit` sem vulnerabilidades altas conhecidas aplicaveis.

Criterio de aceite: dependencias reproduziveis, testes aprovados e nenhuma atualizacao principal sem validacao.

### Etapa 10 - Implantacao unica para producao

Objetivo: servir todas as interfaces e a API com comportamento previsivel.

Alteracoes:

- servir `config.js`, `/admin/` e `/cliente/` explicitamente pelo Express;
- usar caminhos de assets consistentes;
- remover a URL Railway fixa de `config.js` e usar mesma origem;
- configurar dominio personalizado e HTTPS;
- restringir CORS ao dominio oficial e origens explicitas de homologacao;
- configurar corretamente `trust proxy` no Railway;
- garantir cookies `Secure` no ambiente de producao;
- adicionar `GET /health/live` sem dependencias e `GET /health/ready` verificando MySQL e Redis;
- executar migracoes antes de liberar a nova versao;
- separar ambiente de homologacao do ambiente de producao;
- documentar variaveis obrigatorias e validar todas no startup;
- falhar na inicializacao se segredo ou dependencia obrigatoria estiver ausente.

Testes:

- site, admin, cliente e assets por URL direta;
- refresh em rotas do frontend;
- API pela mesma origem;
- CORS recusando origem desconhecida;
- cookies atras do proxy;
- health checks;
- deploy e rollback em homologacao.

Criterio de aceite: nenhuma interface depende de comportamento especifico do Apache nem de URL Railway gravada no codigo.

### Etapa 11 - Migracoes e banco de dados

Objetivo: remover alteracoes de schema durante a inicializacao normal.

Alteracoes:

- escolher uma unica fonte de verdade para o schema;
- adotar migracoes versionadas com tabela de controle;
- converter funcoes `ensure...Table/Columns` em migracoes;
- executar migracoes como etapa unica de deploy;
- impedir que instancias web executem `ALTER TABLE` ao iniciar;
- criar indices para consultas reais e revisar chaves estrangeiras;
- definir transacoes para operacoes com usuario, assinatura, pagamento e contrato;
- testar backup e restauracao;
- criptografar campos pessoais sensiveis com gerenciamento externo de chaves;
- reduzir `raw_payload` ao estritamente necessario ou criptografa-lo;
- definir prazos de retencao conforme LGPD.

Testes:

- banco vazio ate a versao atual;
- banco atual atualizado sem perda;
- migracao repetida nao executa duas vezes;
- rollback ou procedimento de recuperacao;
- restauracao de backup em ambiente separado.

Criterio de aceite: inicializar o servidor nao altera o schema.

### Etapa 12 - Manutencao, observabilidade e administracao

Objetivo: tornar o sistema operavel e auditavel em producao.

Alteracoes:

- dividir `server.js` gradualmente em rotas, servicos, repositorios e middlewares;
- remover rotas antigas e codigo inalcançavel;
- adicionar ESLint, Prettier e comandos de verificacao;
- adicionar CI para sintaxe, lint, testes, auditoria e migracoes;
- logs estruturados com request ID e mascaramento de dados pessoais;
- monitoramento de erros e metricas;
- trilha de auditoria para acoes administrativas;
- substituir admin unico por usuarios administrativos com senha hash, papeis e MFA;
- alertas para falha de webhook, e-mail, Redis, MySQL e SERPRO;
- procedimentos documentados de incidente, backup, restauracao e rotacao de segredos.

Testes:

- permissao por papel;
- auditoria de alteracao sensivel;
- mascaramento de CPF/CNPJ, token e dados bancarios nos logs;
- alerta de falha simulado;
- pipeline bloqueando codigo invalido.

Criterio de aceite: operacoes sensiveis possuem responsavel, registro e alerta.

### Etapa 13 - Documentacao e limpeza final

Objetivo: alinhar documentacao, codigo e operacao.

Alteracoes:

- atualizar `docs/status-tecnico.md` com o painel administrativo existente;
- documentar arquitetura, rotas e fluxos atuais;
- documentar Redis, MySQL, bucket, Mercado Pago e SERPRO;
- documentar configuracao local, homologacao e producao;
- criar checklist de deploy e rollback;
- remover ou arquivar documentacao obsoleta;
- verificar se `public_html.zip` possui segredo ou dado pessoal e retira-lo do workspace se nao for necessario.

Criterio de aceite: uma pessoa nova consegue instalar, testar, publicar e reverter o sistema usando a documentacao.

## 4. Checklist obrigatorio por etapa

Para cada etapa deste plano:

1. criar escopo pequeno e listar arquivos afetados;
2. registrar comportamento anterior;
3. implementar somente o topico atual;
4. executar testes unitarios e de integracao relacionados;
5. fazer teste manual do fluxo principal;
6. executar regressao de login, checkout, admin e cliente;
7. revisar seguranca e logs;
8. registrar resultado e problemas encontrados;
9. somente entao iniciar a proxima etapa.

## 5. Criterios finais de liberacao

O sistema estara pronto para producao quando:

- DAS e dados cadastrais forem sempre vinculados a sessao;
- ativacao e recuperacao de senha usarem tokens seguros;
- sessoes estiverem em Redis e apenas em cookies `HttpOnly`;
- CSRF e rate limiting estiverem ativos;
- todos os webhooks forem autenticados e idempotentes;
- pagamentos nao puderem ser consultados por ID publico isolado;
- uploads forem inspecionados e armazenados de forma privada;
- dependencias altas estiverem corrigidas;
- frontend e API operarem na mesma origem oficial;
- migracoes nao ocorrerem durante o startup;
- testes, health checks, logs e backups estiverem funcionando;
- documentacao corresponder ao codigo implantado.

## 6. Primeiro trabalho recomendado

Comecar pela Etapa 0 e Etapa 1. Depois, implementar a Etapa 2 (Redis, cookie e CSRF), pois ela fornece a base de autenticacao necessaria para corrigir cadastro, CNPJ, DAS e consulta de pagamentos sem criar solucoes temporarias.

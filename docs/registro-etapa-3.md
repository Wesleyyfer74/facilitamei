# Registro da Etapa 3 - Ativacao e recuperacao de senha

Data: 2026-08-07

## Alteracoes realizadas

- criada tabela versionada `client_auth_tokens`;
- tokens possuem finalidade `setup` ou `recovery`;
- token enviado ao cliente tem 256 bits aleatorios;
- banco armazena somente SHA-256 do token;
- validade definida em 30 minutos;
- novo token invalida os anteriores da mesma finalidade;
- confirmacao invalida todos os tokens ainda abertos do cliente;
- troca de senha revoga todas as sessoes do cliente no Redis;
- solicitacoes retornam mensagem neutra para evitar enumeracao;
- setup exige cliente apto, ativo e com pagamento ou assinatura vinculada;
- recuperacao exige que o cliente ja possua senha;
- rota antiga por e-mail, documento e senha retorna HTTP 410;
- tela do cliente ganhou ativacao, recuperacao e confirmacao pelo link;
- senha e confirmacao sao comparadas no navegador e a senha continua validada no backend.

## Novas rotas

```text
POST /api/client/auth/setup/request
POST /api/client/auth/setup/confirm
POST /api/client/auth/recovery/request
POST /api/client/auth/recovery/confirm
```

## Migracao obrigatoria

Antes de publicar esta etapa, executar:

```text
database/add-client-auth-tokens.sql
```

A tabela tambem foi adicionada a `database/schema.sql` e `database/railway-schema.sql` para instalacoes novas.

## Resultado dos testes

```text
suites: 8
tests: 24
pass: 24
fail: 0
```

Cobertura adicionada:

- aleatoriedade e hash do token;
- validade de 30 minutos;
- finalidades permitidas;
- descontinuacao do setup antigo;
- resposta neutra;
- rejeicao de token malformado antes do banco;
- revogacao de todas as sessoes do cliente;
- contrato do novo frontend.

## Testes pendentes de homologacao

- executar a migracao em copia do banco;
- configurar SMTP e confirmar entrega real;
- abrir link real de ativacao e recuperacao;
- confirmar expiracao e tentativa de reutilizacao usando MySQL;
- confirmar que sessoes abertas em dois navegadores sao revogadas;
- verificar o link usando o dominio oficial.

## Proxima etapa

Vincular alteracao de CNPJ e geracao de DAS exclusivamente a sessao autenticada, validar o direito financeiro do cliente e retirar as rotas publicas equivalentes de producao.

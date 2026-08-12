# Etapa 10 - Implantacao unica em producao

## Modelo adotado

O Node/Express passa a servir o site publico, `/admin/`, `/cliente/`, `config.js`, assets e API no mesmo dominio HTTPS. Apache deixa de ser parte obrigatoria da arquitetura de producao. `config.js` usa `window.location.origin` e nao contem URL fixa do Railway.

## Alteracoes

- `/admin/` e `/cliente/` possuem indice explicito no Express.
- HTML nao recebe cache prolongado; assets versionados continuam podendo ser armazenados em cache.
- CORS local e aceito somente fora de producao. Origens extras de producao devem usar HTTPS.
- `trust proxy = 1` e ativado em producao, permitindo que Express reconheca HTTPS atras do proxy Railway.
- Cookies de sessao permanecem `HttpOnly`, `SameSite=Lax` e recebem `Secure` em producao.
- `GET /health/live` confirma que o processo HTTP esta ativo.
- `GET /health/ready` exige MySQL, Redis de sessoes e Redis de rate limiting disponiveis.
- A inicializacao valida variaveis e segredos obrigatorios antes de abrir a porta.
- Foram removidos `CREATE TABLE` e `ALTER TABLE` executados silenciosamente durante requisicoes.
- `npm run db:verify` verifica tabelas e colunas criticas sem alterar o banco.
- `railway.json` executa a verificacao do schema antes do deploy e usa `/health/ready` como health check.

## Procedimento de deploy

1. Criar ambiente de homologacao separado, com banco, Redis, bucket e credenciais sandbox proprios.
2. Fazer backup do banco de destino.
3. Aplicar os SQL pendentes de `database/` de maneira controlada. Para banco novo, aplicar `database/railway-schema.sql`.
4. Executar `npm run db:verify`; qualquer campo ausente interrompe o deploy.
5. Configurar todas as variaveis descritas em `.env.example`, sem copiar valores secretos para o repositorio.
6. Configurar o dominio `facilitameibr.com.br` no Railway e no DNS, com HTTPS valido.
7. Validar `/health/live`, `/health/ready`, site, admin, cliente, login, checkout e webhook em homologacao.
8. Promover a mesma revisao para producao.

O script `db:verify` nao executa migracoes. Isso evita concorrencia entre instancias e alteracoes parciais durante a inicializacao.

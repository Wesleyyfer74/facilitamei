# Registro da Etapa 6 - Rate limiting distribuido

Data: 2026-08-07

## Alteracoes realizadas

- criada camada de rate limiting com Redis;
- armazenamento em memoria permitido apenas fora de producao;
- producao exige `REDIS_URL` tambem para os contadores;
- identificadores sensiveis sao transformados em SHA-256 truncado;
- Railway confia em um proxy somente no ambiente de producao;
- respostas bloqueadas usam HTTP 429;
- adicionados `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` e `Retry-After`;
- webhook possui janela propria e nao consome a cota geral da API.

## Limites aplicados

| Grupo | Limite |
|---|---:|
| API geral | 120 por minuto por IP |
| Login administrativo | 5 por 15 minutos por IP + e-mail |
| Login, ativacao e recuperacao do cliente | 5 por 15 minutos por IP + e-mail |
| Consulta publica de CNPJ | 10 por minuto por IP |
| Criacao de pagamento ou assinatura | 5 por 10 minutos por IP + e-mail |
| Consulta de status de pagamento | 30 por minuto por IP |
| DAS autenticado | 3 por hora por IP + cliente |
| Cadastro empresarial | 10 por hora por IP + cliente |
| Webhook Mercado Pago | 600 por minuto por IP |

## Configuracao

```env
REDIS_URL=redis://127.0.0.1:6379
REDIS_RATE_LIMIT_PREFIX=facilita:rate
```

Os prefixos de sessao e rate limit sao separados, embora possam utilizar a mesma instancia Redis.

## Resultado dos testes

```text
suites: 12
tests: 39
pass: 39
fail: 0
```

Cobertura adicionada:

- incremento e expiracao de janela;
- isolamento por chave;
- hash sem exposicao de e-mail/documento;
- Redis obrigatorio em producao;
- cinco tentativas permitidas e sexta bloqueada;
- cabecalhos e corpo da resposta 429.

## Testes pendentes de homologacao

- dois processos Node compartilhando os mesmos contadores Redis;
- IP real preservado atras do proxy Railway;
- expiracao real das janelas;
- rajada legitima de webhooks;
- indisponibilidade do Redis e alerta operacional;
- ajuste dos limites com metricas de uso real.

## Proxima etapa

Proteger a consulta de status de pagamento por sessao ou token aleatorio temporario, eliminando autorizacao baseada apenas no ID Mercado Pago.

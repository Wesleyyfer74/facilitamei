# Registro da Etapa 5 - Webhooks Mercado Pago

Data: 2026-08-07

## Alteracoes realizadas

- segredo do webhook passou a ser obrigatorio para aceitar eventos suportados;
- assinatura HMAC e validada para pagamentos e assinaturas;
- `x-request-id`, timestamp, assinatura e ID do recurso sao obrigatorios;
- recurso e consultado diretamente na API Mercado Pago antes da atualizacao;
- pagamentos validam moeda BRL, plano/vinculo local e valor esperado;
- assinaturas exigem registro local e validam plano Mercado Pago, moeda e valor;
- criada tabela idempotente `mercado_pago_webhook_events`;
- evento repetido em processamento ou processado nao repete efeitos;
- evento com falha pode ser tentado novamente;
- processamento abandonado por mais de cinco minutos pode ser retomado;
- falhas deixaram de retornar HTTP 200 incondicionalmente;
- erros permanentes usam o status correspondente e falhas transitorias retornam 500;
- logs deixaram de incluir metadata, referencia externa e dados pessoais;
- tipos desconhecidos sao reconhecidos e ignorados sem alterar dados.

## Migracao obrigatoria

Antes de publicar esta etapa, executar:

```text
database/add-mercado-pago-webhook-events.sql
```

A tabela tambem integra os schemas de instalacao nova.

## Configuracao obrigatoria

```env
MERCADO_PAGO_WEBHOOK_SECRET=segredo-configurado-no-mercado-pago
```

Sem o segredo correto, pagamentos e assinaturas recebem HTTP 401 e nao alteram o banco.

## Resultado dos testes

```text
suites: 10
tests: 34
pass: 34
fail: 0
```

Cobertura adicionada:

- classificacao de pagamentos e assinaturas;
- recusa de ambos sem HMAC;
- recusa quando o segredo nao esta configurado;
- assinatura valida, incompleta e adulterada;
- validacao monetaria;
- evento desconhecido sem efeito.

## Testes pendentes de homologacao

- executar a migracao em copia do banco;
- webhook real assinado de pagamento aprovado;
- webhook real assinado de assinatura;
- entrega duplicada do mesmo `x-request-id`;
- divergencia proposital de valor, moeda e plano;
- falha temporaria do banco seguida de retentativa;
- evento recuperado depois de processamento interrompido;
- conferir configuracao do segredo no painel Mercado Pago.

## Proxima etapa

Adicionar rate limiting distribuido via Redis para login, ativacao, recuperacao, CNPJ, pagamentos, DAS, status e API geral.

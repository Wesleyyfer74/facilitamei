# Plano do Modulo NFS-e

## Arquivos encontrados

- `server.js`: backend Node.js/Express em ESM, com rotas REST, CORS, seguranca, Mercado Pago, MySQL e autenticacao administrativa por sessao/token.
- `package.json`: stack sem framework full-stack; usa `express`, `mysql2/promise`, `dotenv`, `cors` e `mercadopago`.
- `database/schema.sql` e `database/railway-schema.sql`: SQL manual para MySQL, sem Prisma/Sequelize/Knex.
- `admin/`: frontend administrativo separado, consumindo `/api/admin/*`.
- `index.html`, `app.js`, `styles.css`: frontend publico e checkout.

## Onde o modulo sera criado

- Pasta isolada: `nfse/`
- Arquivos previstos:
  - `nfse/config.js`: dados fixos da FACILITA e leitura segura de `.env`.
  - `nfse/cnpj.js`: consulta/mock de dados publicos do CNPJ do tomador.
  - `nfse/xml.js`: geracao mock do XML da DPS.
  - `nfse/service.js`: regras de tomador, sequencia DPS, anti-duplicidade e emissao pendente.
  - `nfse/routes.js`: rotas administrativas para listar, consultar e gerar XML mock.
- SQL isolado: `database/nfse-schema.sql`

## Tabelas necessarias

- O projeto ja possui tabelas equivalentes a clientes, planos, assinaturas e pagamentos:
  - `users` equivale a `clientes`;
  - `plans` equivale a `planos`;
  - `subscriptions` equivale a `assinaturas`;
  - `payments` equivale a `pagamentos`.
- `database/nfse-schema.sql` adiciona os campos faltantes nessas tabelas existentes.
- `configuracoes_nfse`: dados fixos da empresa emissora FACILITA e controle do proximo numero DPS.
- `nfse_emissoes`: registros de emissoes NFS-e/DPS, com XML, status, pagamento, assinatura e flags de envio.
- Views opcionais de leitura sao criadas com os nomes `clientes`, `planos`, `assinaturas` e `pagamentos`.

Anti-duplicidade inicial:

- `nfse_emissoes` tera chave unica por `assinatura_id + competencia`.
- Isso impede gerar duas emissoes para a mesma assinatura no mesmo mes.
- `pagamento_id` em `nfse_emissoes` tambem tem indice unico.
- `gateway_payment_id` em `payments` e unico para impedir duplicidade do gateway.
- `cnpj` em `users` tem indice unico quando preenchido.

## Variaveis `.env` necessarias

```env
NFSE_MOCK=true
NFSE_AUTO_CREATE_PENDING=true
NFSE_ENV=development
NFSE_DPS_SERIE=1
NFSE_DPS_NEXT_NUMBER=357
NFSE_CNPJ_LOOKUP_URL=
NFSE_NACIONAL_API_URL=
NFSE_CERT_PATH=
NFSE_CERT_PASSWORD=
NFSE_EMAIL_FROM=
NFSE_EMAIL_PROVIDER=
```

Observacoes:

- Certificado digital real e senha nunca devem entrar no codigo.
- `NFSE_CERT_PASSWORD` deve ficar apenas no ambiente seguro do servidor.
- Em desenvolvimento, `NFSE_MOCK=true` gera apenas XML simulado.

## Etapas que ficarao em mock

- Consulta publica real de CNPJ quando `NFSE_CNPJ_LOOKUP_URL` nao estiver configurada.
- Assinatura digital XML.
- Envio para a API NFS-e Nacional.
- Retorno oficial da NFS-e autorizada.
- Envio por e-mail e WhatsApp.

## Fluxo inicial planejado

1. Assinatura e cliente continuam sendo criados pelo fluxo Mercado Pago atual.
2. Depois de salvar a assinatura local, o modulo NFS-e cria/atualiza o tomador.
3. O sistema busca dados publicos do CNPJ se houver URL configurada; em mock usa os dados locais.
4. O modulo cria uma emissao pendente com valor do plano.
5. Em modo mock, gera e salva XML da DPS em `nfse_emissoes.xml_dps`.
6. Rotas admin permitem listar e consultar emissoes.

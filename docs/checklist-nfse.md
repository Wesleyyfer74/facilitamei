# Checklist tecnico NFS-e

Use este checklist antes de ativar qualquer emissao real. Por padrao o modulo deve permanecer em mock.

## Ambiente

- [ ] `NODE_ENV` diferente de `production` para testes locais.
- [ ] `NFSE_MOCK=true` em desenvolvimento/homologacao.
- [ ] `NFSE_AUTO_EMITIR=false` enquanto o envio real nao estiver validado.
- [ ] Envio real desativado por padrao.
- [ ] Certificado A1 fora do repositorio.
- [ ] `.gitignore` bloqueando `.pfx`, `.p12`, `.pem`, `.key` e `secure/`.

## Banco de dados

- [ ] Script `database/nfse-schema.sql` executado no banco.
- [ ] Tabela `configuracoes_nfse` possui seed da FACILITA.
- [ ] Configuracao NFS-e cadastrada.
- [ ] Proximo numero DPS configurado.
- [ ] Tabela `nfse_emissoes` aceita status `pendente`, `gerando_xml`, `dps_gerada`, `assinado`, `enviado`, `emitida` e `erro`.
- [ ] `payments.gateway_payment_id` unico.
- [ ] `nfse_emissoes.pagamento_id` unico.

## Cliente e plano

- [ ] CNPJ cliente valido.
- [ ] Cliente salvo com razao social.
- [ ] Cliente salvo com codigo IBGE do municipio.
- [ ] Cliente salvo com endereco minimo para tomador.
- [ ] Plano salvo com valor.
- [ ] Plano possui `descricao_nfse` ou descricao padrao configurada.

## Pagamento e emissao

- [ ] Pagamento aprovado salvo.
- [ ] Pagamento vinculado a assinatura.
- [ ] Assinatura vinculada a cliente e plano.
- [ ] Emissao criada.
- [ ] XML DPS gerado.
- [ ] XML DPS assinado em mock ou real conforme ambiente.
- [ ] XML NFS-e simulado/retornado salvo.
- [ ] Emissao duplicada bloqueada.
- [ ] `payments.nfse_emitida=true` apenas apos sucesso da emissao/mock.

## E-mail e WhatsApp

- [ ] Variaveis SMTP configuradas quando envio real de e-mail for usado.
- [ ] E-mail enviado.
- [ ] `nfse_emissoes.enviada_email=true` apos envio com sucesso.
- [ ] Se cliente nao tiver e-mail, emissao nao falha.
- [ ] Mensagem WhatsApp gerada por placeholder.
- [ ] WhatsApp Cloud API ainda nao implementada.

## Rotas de verificacao

- [ ] `POST /api/cnpj/consultar` consulta e salva o tomador.
- [ ] `POST /api/testes/nfse/fluxo-completo` executa teste completo em mock.
- [ ] `GET /api/nfse` lista notas fiscais.
- [ ] `GET /api/nfse/:id` mostra detalhe.
- [ ] `GET /api/nfse/:id/xml-dps` baixa XML DPS.
- [ ] `POST /api/nfse/:id/enviar-email` envia/reenvia e-mail.

## Teste completo esperado

Entrada:

```json
{
  "cnpj": "52643976000186",
  "email": "cliente@email.com",
  "whatsapp": "67999999999",
  "planoId": "contabilidade_basico"
}
```

Resultado esperado:

- [ ] Cliente criado/atualizado.
- [ ] Assinatura teste criada.
- [ ] Pagamento teste aprovado criado.
- [ ] Emissao NFS-e mock criada.
- [ ] XML DPS retornado no resumo.
- [ ] Segunda chamada interna retorna a mesma emissao.
- [ ] `checklist.emissaoDuplicadaBloqueada=true`.


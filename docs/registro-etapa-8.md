# Etapa 8 - Upload e armazenamento privado de documentos

## Alteracoes implementadas

- Multer atualizado para 2.2.0, removendo as vulnerabilidades conhecidas da versao anterior.
- O MIME e a extensao informados pelo navegador deixaram de ser considerados prova do tipo do arquivo.
- PDF, JPEG, PNG, WEBP, DOCX e XLSX sao validados pela assinatura/conteudo real.
- TXT, CSV e XML passam por validacao de texto e rejeitam bytes nulos ou codificacao invalida.
- ZIP, executaveis, HTML, SVG, JavaScript, formatos antigos do Office e documentos com macro sao bloqueados.
- ClamAV pode inspecionar cada upload; em producao a ausencia ou indisponibilidade do antivirus bloqueia o envio.
- Novos documentos e PDFs de DAS sao armazenados em bucket privado S3, com hash SHA-256 e tamanho no MySQL.
- O banco mantem leitura temporaria do campo Base64 apenas para documentos antigos ainda nao migrados.
- Os diretorios `data` sao bloqueados no Express e no Apache.

## Implantacao em producao

1. Configurar `DOCUMENT_STORAGE_DRIVER=s3` e as variaveis `S3_DOCUMENTS_*`.
2. Configurar o bucket como privado, sem acesso publico, com criptografia e politica de menor privilegio.
3. Disponibilizar ClamAV e configurar `CLAMAV_HOST`, mantendo `FILE_ANTIVIRUS_REQUIRED=true`.
4. Executar `database/add-private-document-storage.sql` uma unica vez antes da nova versao.
5. Fazer backup do banco e executar `npm run migrate:documents-storage` para retirar os Base64 antigos do MySQL.
6. Confirmar que nao restam linhas com `storage_key IS NULL AND base64_data IS NOT NULL`.

O script de migracao e retomavel: processa apenas registros ainda sem chave de armazenamento. Ele nao deve ser executado antes do backup e da configuracao definitiva do bucket.

## Verificacao

- `npm run check`: aprovado.
- `npm test`: 50 testes aprovados, nenhuma falha.
- Foram adicionados testes de assinatura real, arquivos disfarçados, formatos bloqueados, hash, armazenamento privado e indisponibilidade do antivirus.

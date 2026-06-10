import { getNfseConfig } from "./config.js";
import { lookupCnpj } from "./cnpj.js";
import { buildMockDpsXml } from "./xml.js";
import { gerarXmlDps } from "../src/services/nfse/gerarXmlDps.js";
import { createNfseWorkflow } from "../src/services/nfse/nfseWorkflow.js";
import { enviarEmailNotaFiscal, gerarMensagemWhatsappNota } from "../src/services/notificacoes/notaEmailService.js";

function normalizeDigits(value = "") {
  return String(value).replace(/\D/g, "");
}

function getCompetence(date = new Date()) {
  return new Date(date).toISOString().slice(0, 7);
}

function getAddressValue(address, keys) {
  if (!address || typeof address !== "object") return null;
  for (const key of keys) {
    if (address[key]) return address[key];
  }
  return null;
}

async function getSubscriptionContext(dbPool, subscriptionId) {
  const [rows] = await dbPool.execute(
    `SELECT
      s.id AS assinatura_id,
      s.user_id AS cliente_id,
      s.plan_id AS plano_id,
      s.valor,
      s.created_at AS assinatura_created_at,
      u.nome,
      u.email,
      COALESCE(u.whatsapp, u.telefone) AS whatsapp,
      u.telefone,
      u.documento,
      u.cnpj,
      u.razao_social,
      u.nome_fantasia,
      u.cep,
      u.logradouro,
      u.numero,
      u.bairro,
      u.municipio,
      u.codigo_municipio,
      u.uf,
      u.cnae_principal_codigo,
      u.cnae_principal_descricao,
      p.nome AS plano_nome,
      p.descricao AS plano_descricao,
      p.descricao_nfse,
      p.servico AS service_code
     FROM subscriptions s
     JOIN users u ON u.id = s.user_id
     JOIN plans p ON p.id = s.plan_id
     WHERE s.id = :subscriptionId
     LIMIT 1`,
    { subscriptionId },
  );

  return rows[0] || null;
}

async function getNfseSettings(connection) {
  const [rows] = await connection.execute("SELECT * FROM configuracoes_nfse WHERE id = 1 FOR UPDATE");

  if (!rows[0]) {
    throw new Error("configuracoes_nfse nao possui seed inicial. Rode database/nfse-schema.sql.");
  }

  return rows[0];
}

async function reserveDpsNumber(connection, settings) {
  const numeroDps = Number(settings.proximo_numero_dps || 357);

  await connection.execute(
    `UPDATE configuracoes_nfse
     SET proximo_numero_dps = proximo_numero_dps + 1
     WHERE id = :settingsId`,
    { settingsId: settings.id },
  );

  return {
    serieDps: String(settings.serie_dps || "1"),
    numeroDps,
  };
}

async function buildClientData(context, config) {
  const document = normalizeDigits(context.cnpj || context.documento);
  const cnpj = document.length === 14 ? document : "";

  return lookupCnpj(cnpj, {
    lookupUrl: config.cnpjLookupUrl,
    fallback: {
      cnpj,
      razaoSocial: context.razao_social || context.nome,
      email: context.email,
      telefone: context.whatsapp || context.telefone,
      municipio: context.municipio,
      codigoMunicipio: context.codigo_municipio,
      uf: context.uf,
    },
  });
}

async function updateClientNfseData(connection, context, clientData) {
  const address = clientData.endereco || {};
  const cnpj = normalizeDigits(clientData.cnpj);

  await connection.execute(
    `UPDATE users
     SET whatsapp = COALESCE(whatsapp, :whatsapp),
         cnpj = COALESCE(cnpj, :cnpj),
         razao_social = COALESCE(:razaoSocial, razao_social),
         nome_fantasia = COALESCE(:nomeFantasia, nome_fantasia),
         cep = COALESCE(:cep, cep),
         logradouro = COALESCE(:logradouro, logradouro),
         numero = COALESCE(:numero, numero),
         bairro = COALESCE(:bairro, bairro),
         municipio = COALESCE(:municipio, municipio),
         codigo_municipio = COALESCE(:codigoMunicipio, codigo_municipio),
         uf = COALESCE(:uf, uf),
         cnae_principal_codigo = COALESCE(:cnaeCodigo, cnae_principal_codigo),
         cnae_principal_descricao = COALESCE(:cnaeDescricao, cnae_principal_descricao),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = :clienteId`,
    {
      clienteId: context.cliente_id,
      whatsapp: normalizeDigits(clientData.telefone || context.whatsapp || context.telefone),
      cnpj: cnpj || null,
      razaoSocial: clientData.razaoSocial || context.razao_social || context.nome,
      nomeFantasia: clientData.nomeFantasia || context.nome_fantasia || null,
      cep: normalizeDigits(getAddressValue(address, ["cep", "zip_code", "codigo_postal"])) || context.cep || null,
      logradouro: getAddressValue(address, ["logradouro", "rua", "street"]) || context.logradouro || null,
      numero: getAddressValue(address, ["numero", "number"]) || context.numero || null,
      bairro: getAddressValue(address, ["bairro", "district"]) || context.bairro || null,
      municipio: clientData.municipio || context.municipio || null,
      codigoMunicipio: clientData.codigoMunicipio || context.codigo_municipio || null,
      uf: clientData.uf || context.uf || null,
      cnaeCodigo: clientData.rawPayload?.cnae_principal_codigo || clientData.rawPayload?.cnaePrincipalCodigo || context.cnae_principal_codigo || null,
      cnaeDescricao:
        clientData.rawPayload?.cnae_principal_descricao ||
        clientData.rawPayload?.cnaePrincipalDescricao ||
        context.cnae_principal_descricao ||
        null,
    },
  );
}

function buildServiceDescription(context, settings) {
  return (
    context.descricao_nfse ||
    `Nota fiscal da assinatura do ${context.plano_nome}. ${settings.descricao_servico_padrao}`
  );
}

function toXmlTaker(context, clientData) {
  return {
    cnpj: normalizeDigits(clientData.cnpj || context.cnpj || context.documento),
    razao_social: clientData.razaoSocial || context.razao_social || context.nome,
    telefone: normalizeDigits(clientData.telefone || context.whatsapp || context.telefone),
    email: clientData.email || context.email,
    municipio: clientData.municipio || context.municipio,
    codigo_municipio: clientData.codigoMunicipio || context.codigo_municipio,
    uf: clientData.uf || context.uf,
  };
}

export function createNfseService({ dbPool }) {
  const nfseWorkflow = createNfseWorkflow({ dbPool });

  async function createPendingForSubscription(subscriptionId) {
    const config = getNfseConfig();

    if (!config.autoCreatePending) {
      return { skipped: true, reason: "NFSE_AUTO_CREATE_PENDING=false" };
    }

    const context = await getSubscriptionContext(dbPool, subscriptionId);
    if (!context) return { skipped: true, reason: "subscription_not_found" };

    const competence = getCompetence(context.assinatura_created_at || new Date());
    const [existing] = await dbPool.execute(
      `SELECT *
       FROM nfse_emissoes
       WHERE assinatura_id = :subscriptionId AND competencia = :competence
       LIMIT 1`,
      { subscriptionId, competence },
    );

    if (existing[0]) return { skipped: true, invoice: existing[0], reason: "already_exists" };

    const clientData = await buildClientData(context, config);
    const connection = await dbPool.getConnection();

    try {
      await connection.beginTransaction();

      const settings = await getNfseSettings(connection);
      const dps = await reserveDpsNumber(connection, settings);
      const descricaoServico = buildServiceDescription(context, settings);

      await updateClientNfseData(connection, context, clientData);

      const [result] = await connection.execute(
        `INSERT INTO nfse_emissoes
          (cliente_id, assinatura_id, pagamento_id, numero_dps, serie_dps, valor, competencia, descricao_servico, status)
         VALUES
          (:clienteId, :assinaturaId, NULL, :numeroDps, :serieDps, :valor, :competencia, :descricaoServico, 'pendente')`,
        {
          clienteId: context.cliente_id,
          assinaturaId: subscriptionId,
          numeroDps: dps.numeroDps,
          serieDps: dps.serieDps,
          valor: Number(context.valor || 0),
          competencia: competence,
          descricaoServico,
        },
      );

      const invoice = {
        id: result.insertId,
        cliente_id: context.cliente_id,
        assinatura_id: subscriptionId,
        pagamento_id: null,
        numero_dps: dps.numeroDps,
        serie_dps: dps.serieDps,
        dps_numero: dps.numeroDps,
        dps_serie: dps.serieDps,
        valor: Number(context.valor || 0),
        competencia: competence,
        descricao_servico: descricaoServico,
      };

      if (config.mock) {
        const xml = buildMockDpsXml({
          invoice,
          taker: toXmlTaker(context, clientData),
          plan: {
            title: context.plano_nome,
            nome: context.plano_nome,
            description: context.plano_descricao,
          },
          settings,
          environment: config.environment,
        });

        await connection.execute(
          `UPDATE nfse_emissoes
           SET status = 'mock_gerado',
               xml_dps = :xml,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = :invoiceId`,
          { invoiceId: invoice.id, xml },
        );

        invoice.status = "mock_gerado";
        invoice.xml_dps = xml;
      }

      await connection.commit();
      return { created: true, invoice };
    } catch (error) {
      await connection.rollback();
      if (error?.code === "ER_DUP_ENTRY") {
        const [rows] = await dbPool.execute(
          `SELECT *
           FROM nfse_emissoes
           WHERE assinatura_id = :subscriptionId AND competencia = :competence
           LIMIT 1`,
          { subscriptionId, competence },
        );
        return { skipped: true, invoice: rows[0], reason: "duplicate_guard" };
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  async function createPendingForSubscriptionSafe(subscriptionId) {
    try {
      return await createPendingForSubscription(subscriptionId);
    } catch (error) {
      console.error("NFS-e pendente nao foi criada:", {
        subscriptionId,
        code: error.code,
        message: error.message,
      });
      return { skipped: true, reason: "error", error: error.message };
    }
  }

  async function listInvoices({ status = "", limit = 80 } = {}) {
    const params = { limit: Math.min(Number(limit) || 80, 200) };
    let statusFilter = "";

    if (status) {
      statusFilter = "WHERE n.status = :status";
      params.status = status;
    }

    const [rows] = await dbPool.execute(
      `SELECT
        n.id, n.cliente_id, n.assinatura_id, n.pagamento_id, n.competencia, n.serie_dps, n.numero_dps,
        n.valor, n.descricao_servico, n.status, n.numero_nfse, n.chave_acesso, n.codigo_verificacao,
        n.erro_mensagem, n.enviada_email, n.enviada_whatsapp, n.created_at, n.updated_at,
        u.nome AS cliente_nome, u.email AS cliente_email, u.cnpj AS cliente_cnpj
       FROM nfse_emissoes n
       JOIN users u ON u.id = n.cliente_id
       ${statusFilter}
       ORDER BY n.created_at DESC
       LIMIT :limit`,
      params,
    );

    return rows;
  }

  async function listFiscalNotes({ status = "", limit = 120 } = {}) {
    const params = { limit: Math.min(Number(limit) || 120, 300) };
    let statusFilter = "";

    if (status) {
      statusFilter = "WHERE n.status = :status";
      params.status = status;
    }

    const [rows] = await dbPool.execute(
      `SELECT
        n.id,
        n.cliente_id,
        n.assinatura_id,
        n.pagamento_id,
        n.valor,
        n.competencia,
        n.status,
        n.serie_dps,
        n.numero_dps,
        n.numero_nfse,
        n.chave_acesso,
        n.codigo_verificacao,
        n.erro_mensagem,
        n.enviada_email,
        n.enviada_whatsapp,
        n.created_at,
        n.updated_at,
        u.nome AS cliente,
        u.email AS cliente_email,
        u.cnpj AS cliente_cnpj,
        COALESCE(u.whatsapp, u.telefone) AS cliente_whatsapp,
        pl.nome AS plano,
        pl.id AS plano_id
       FROM nfse_emissoes n
       JOIN users u ON u.id = n.cliente_id
       LEFT JOIN subscriptions s ON s.id = n.assinatura_id
       LEFT JOIN plans pl ON pl.id = s.plan_id
       ${statusFilter}
       ORDER BY n.created_at DESC
       LIMIT :limit`,
      params,
    );

    return rows;
  }

  async function getInvoice(invoiceId) {
    const [rows] = await dbPool.execute(
      `SELECT n.*, u.nome AS cliente_nome, u.email AS cliente_email, u.cnpj AS cliente_cnpj
       FROM nfse_emissoes n
       JOIN users u ON u.id = n.cliente_id
       WHERE n.id = :invoiceId
       LIMIT 1`,
      { invoiceId },
    );

    return rows[0] || null;
  }

  async function getFiscalNote(invoiceId) {
    const [rows] = await dbPool.execute(
      `SELECT
        n.*,
        u.nome AS cliente,
        u.email AS cliente_email,
        COALESCE(u.whatsapp, u.telefone) AS cliente_whatsapp,
        u.documento AS cliente_documento,
        u.cnpj AS cliente_cnpj,
        u.razao_social AS cliente_razao_social,
        u.nome_fantasia AS cliente_nome_fantasia,
        u.cep AS cliente_cep,
        u.logradouro AS cliente_logradouro,
        u.numero AS cliente_numero,
        u.bairro AS cliente_bairro,
        u.municipio AS cliente_municipio,
        u.codigo_municipio AS cliente_codigo_municipio,
        u.uf AS cliente_uf,
        pl.id AS plano_id,
        pl.nome AS plano,
        pl.descricao_nfse AS plano_descricao_nfse,
        s.status AS assinatura_status,
        pay.status AS pagamento_status,
        pay.gateway_payment_id,
        pay.mercado_pago_payment_id
       FROM nfse_emissoes n
       JOIN users u ON u.id = n.cliente_id
       LEFT JOIN subscriptions s ON s.id = n.assinatura_id
       LEFT JOIN plans pl ON pl.id = s.plan_id
       LEFT JOIN payments pay ON pay.id = n.pagamento_id
       WHERE n.id = :invoiceId
       LIMIT 1`,
      { invoiceId },
    );

    return rows[0] || null;
  }

  async function getFiscalNoteXml(invoiceId, field) {
    const allowedFields = new Set(["xml_dps", "xml_nfse"]);
    if (!allowedFields.has(field)) {
      const error = new Error("Campo XML invalido.");
      error.status = 400;
      throw error;
    }

    const [rows] = await dbPool.execute(
      `SELECT id, ${field} AS xml
       FROM nfse_emissoes
       WHERE id = :invoiceId
       LIMIT 1`,
      { invoiceId },
    );

    const row = rows[0];
    if (!row) {
      const error = new Error("NFS-e nao encontrada.");
      error.status = 404;
      throw error;
    }

    if (!row.xml) {
      const error = new Error("XML ainda nao esta disponivel para esta nota.");
      error.status = 404;
      throw error;
    }

    return row.xml;
  }

  async function reenviarEmail(invoiceId) {
    const invoice = await getFiscalNote(invoiceId);

    if (!invoice) {
      const error = new Error("NFS-e nao encontrada.");
      error.status = 404;
      throw error;
    }

    if (!invoice.xml_dps && !invoice.xml_nfse) {
      const error = new Error("Nao ha XML gerado para reenviar.");
      error.status = 400;
      throw error;
    }

    const result = await enviarEmailNotaFiscal({
      cliente: {
        id: invoice.cliente_id,
        nome: invoice.cliente,
        email: invoice.cliente_email,
        razao_social: invoice.cliente_razao_social,
        cnpj: invoice.cliente_cnpj,
      },
      emissao: invoice,
    });

    if (result.sent) {
      await dbPool.execute(
        `UPDATE nfse_emissoes
         SET enviada_email = 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = :invoiceId`,
        { invoiceId },
      );
    }

    return {
      ...result,
      message: result.sent
        ? "E-mail da nota fiscal enviado."
        : "E-mail nao enviado. Verifique se o cliente possui e-mail e se o SMTP esta configurado.",
      whatsappMessage: gerarMensagemWhatsappNota({
        cliente: {
          nome: invoice.cliente,
          razao_social: invoice.cliente_razao_social,
        },
        emissao: invoice,
      }),
      invoice,
    };
  }

  async function retryFiscalNote(invoiceId) {
    const invoice = await getFiscalNote(invoiceId);

    if (!invoice) {
      const error = new Error("NFS-e nao encontrada.");
      error.status = 404;
      throw error;
    }

    if (invoice.status !== "erro") return invoice;

    if (!invoice.pagamento_id) {
      const error = new Error("Esta emissao nao possui pagamento vinculado para tentar novamente.");
      error.status = 400;
      throw error;
    }

    await dbPool.execute("DELETE FROM nfse_emissoes WHERE id = :invoiceId AND status = 'erro'", { invoiceId });
    return nfseWorkflow.criarNfseParaPagamento(invoice.pagamento_id);
  }

  async function enviarFiscalNote(invoiceId) {
    return nfseWorkflow.enviarNfsePorEmissao(invoiceId);
  }

  async function generateMockDps({ clienteId, planoId, valor }) {
    const config = getNfseConfig();

    if (!config.mock) {
      const error = new Error("Geracao mock de DPS esta desativada.");
      error.status = 403;
      throw error;
    }

    const [clientes] = await dbPool.execute(
      `SELECT
        id, nome, email, COALESCE(whatsapp, telefone) AS whatsapp, telefone, cnpj, razao_social,
        nome_fantasia, cep, logradouro, numero, bairro, municipio, codigo_municipio, uf,
        cnae_principal_codigo, cnae_principal_descricao
       FROM users
       WHERE id = :clienteId
       LIMIT 1`,
      { clienteId: Number(clienteId) },
    );

    if (!clientes[0]) {
      const error = new Error("Cliente nao encontrado para gerar DPS.");
      error.status = 404;
      throw error;
    }

    const [planos] = await dbPool.execute(
      `SELECT id, nome, valor, descricao, descricao_nfse, ativo
       FROM plans
       WHERE id = :planoId
       LIMIT 1`,
      { planoId },
    );

    if (!planos[0]) {
      const error = new Error("Plano nao encontrado para gerar DPS.");
      error.status = 404;
      throw error;
    }

    const cliente = clientes[0];
    const plano = planos[0];
    const valorDps = Number(valor || plano.valor);
    const competencia = getCompetence(new Date());
    const connection = await dbPool.getConnection();

    try {
      await connection.beginTransaction();

      const settings = await getNfseSettings(connection);
      const dps = await reserveDpsNumber(connection, settings);
      const descricaoServico =
        plano.descricao_nfse ||
        `Nota fiscal da assinatura do ${plano.nome}. ${settings.descricao_servico_padrao}`;

      const [result] = await connection.execute(
        `INSERT INTO nfse_emissoes
          (cliente_id, assinatura_id, pagamento_id, numero_dps, serie_dps, valor, competencia, descricao_servico, status)
         VALUES
          (:clienteId, NULL, NULL, :numeroDps, :serieDps, :valor, :competencia, :descricaoServico, 'pendente')`,
        {
          clienteId: cliente.id,
          numeroDps: dps.numeroDps,
          serieDps: dps.serieDps,
          valor: valorDps,
          competencia,
          descricaoServico,
        },
      );

      const emissao = {
        id: result.insertId,
        cliente_id: cliente.id,
        assinatura_id: null,
        pagamento_id: null,
        numero_dps: dps.numeroDps,
        serie_dps: dps.serieDps,
        valor: valorDps,
        competencia,
        descricao_servico: descricaoServico,
      };

      const xml = gerarXmlDps({
        configuracaoNfse: settings,
        cliente,
        plano,
        pagamento: {
          valor: valorDps,
          competencia,
        },
        emissao,
      });

      await connection.execute(
        `UPDATE nfse_emissoes
         SET status = 'mock_gerado',
             xml_dps = :xml,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = :emissaoId`,
        { emissaoId: emissao.id, xml },
      );

      await connection.commit();

      return {
        emissaoId: emissao.id,
        xml,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  return {
    createPendingForSubscription,
    createPendingForSubscriptionSafe,
    listInvoices,
    getInvoice,
    listFiscalNotes,
    getFiscalNote,
    getFiscalNoteXml,
    reenviarEmail,
    retryFiscalNote,
    enviarFiscalNote,
    generateMockDps,
    criarNfseParaPagamento: nfseWorkflow.criarNfseParaPagamento,
  };
}

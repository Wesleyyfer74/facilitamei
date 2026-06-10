import { gerarXmlDps } from "./gerarXmlDps.js";
import { assinarXmlDps } from "./assinarXmlDps.js";
import { enviarDpsParaSefin } from "./sefinClient.js";
import { extrairRetornoNfse } from "./extrairRetornoNfse.js";
import { enviarEmailNotaFiscal } from "../notificacoes/notaEmailService.js";

const APPROVED_PAYMENT_STATUSES = new Set(["approved", "paid", "authorized", "accredited"]);

class NfseWorkflowError extends Error {
  constructor(message, { status = 500, code = "NFSE_WORKFLOW_ERROR", emissaoId = null } = {}) {
    super(message);
    this.name = "NfseWorkflowError";
    this.status = status;
    this.code = code;
    this.emissaoId = emissaoId;
  }
}

function getCompetencia(pagamento) {
  if (pagamento?.competencia) return String(pagamento.competencia).slice(0, 7);
  const baseDate = pagamento?.data_pagamento || pagamento?.created_at || new Date();
  return new Date(baseDate).toISOString().slice(0, 7);
}

function buildDescricaoServico(plano, configuracaoNfse) {
  return (
    plano.descricao_nfse ||
    `Nota fiscal da assinatura do ${plano.nome}. ${configuracaoNfse.descricao_servico_padrao}`
  );
}

function normalizePaymentStatus(status = "") {
  return String(status || "").trim().toLowerCase();
}

async function enviarEmailDaEmissao(dbPool, emissaoId) {
  const [rows] = await dbPool.execute(
    `SELECT
      n.*,
      u.id AS cliente_id,
      u.nome,
      u.email,
      u.razao_social,
      u.cnpj
     FROM nfse_emissoes n
     JOIN users u ON u.id = n.cliente_id
     WHERE n.id = :emissaoId
     LIMIT 1`,
    { emissaoId },
  );

  const row = rows[0];
  if (!row) return { sent: false, reason: "emissao_nao_encontrada" };

  const result = await enviarEmailNotaFiscal({
    cliente: {
      id: row.cliente_id,
      nome: row.nome,
      email: row.email,
      razao_social: row.razao_social,
      cnpj: row.cnpj,
    },
    emissao: row,
  });

  if (result.sent) {
    await dbPool.execute(
      `UPDATE nfse_emissoes
       SET enviada_email = 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :emissaoId`,
      { emissaoId },
    );
  }

  return result;
}

async function buscarEmissaoPorPagamento(dbPool, pagamentoId) {
  const [rows] = await dbPool.execute(
    `SELECT *
     FROM nfse_emissoes
     WHERE pagamento_id = :pagamentoId
     LIMIT 1`,
    { pagamentoId },
  );

  return rows[0] || null;
}

async function buscarContextoPagamento(connection, pagamentoId) {
  const [rows] = await connection.execute(
    `SELECT
      pay.id AS pagamento_id,
      pay.subscription_id AS assinatura_id,
      pay.gateway,
      pay.gateway_payment_id,
      pay.valor AS pagamento_valor,
      pay.status AS pagamento_status,
      pay.data_pagamento,
      pay.competencia,
      pay.nfse_emitida,
      pay.created_at AS pagamento_created_at,
      s.user_id AS cliente_id,
      s.plan_id AS plano_id,
      s.status AS assinatura_status,
      u.id AS user_id,
      u.nome AS cliente_nome,
      u.email AS cliente_email,
      COALESCE(u.whatsapp, u.telefone) AS cliente_whatsapp,
      u.telefone AS cliente_telefone,
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
      u.cnae_principal_codigo AS cliente_cnae_principal_codigo,
      u.cnae_principal_descricao AS cliente_cnae_principal_descricao,
      p.id AS plan_id,
      p.nome AS plano_nome,
      p.valor AS plano_valor,
      p.descricao AS plano_descricao,
      p.descricao_nfse AS plano_descricao_nfse,
      p.ativo AS plano_ativo
     FROM payments pay
     JOIN subscriptions s ON s.id = pay.subscription_id
     JOIN users u ON u.id = s.user_id
     JOIN plans p ON p.id = s.plan_id
     WHERE pay.id = :pagamentoId
     LIMIT 1
     FOR UPDATE`,
    { pagamentoId },
  );

  return rows[0] || null;
}

function montarObjetosDominio(contexto, configuracaoNfse, numeroDps, serieDps, emissaoId) {
  const cliente = {
    id: contexto.cliente_id,
    nome: contexto.cliente_nome,
    email: contexto.cliente_email,
    whatsapp: contexto.cliente_whatsapp,
    telefone: contexto.cliente_telefone,
    cnpj: contexto.cliente_cnpj,
    razao_social: contexto.cliente_razao_social,
    nome_fantasia: contexto.cliente_nome_fantasia,
    cep: contexto.cliente_cep,
    logradouro: contexto.cliente_logradouro,
    numero: contexto.cliente_numero,
    bairro: contexto.cliente_bairro,
    municipio: contexto.cliente_municipio,
    codigo_municipio: contexto.cliente_codigo_municipio,
    uf: contexto.cliente_uf,
    cnae_principal_codigo: contexto.cliente_cnae_principal_codigo,
    cnae_principal_descricao: contexto.cliente_cnae_principal_descricao,
  };

  const plano = {
    id: contexto.plan_id,
    nome: contexto.plano_nome,
    valor: Number(contexto.plano_valor || 0),
    descricao: contexto.plano_descricao,
    descricao_nfse: contexto.plano_descricao_nfse,
    ativo: contexto.plano_ativo,
  };

  const pagamento = {
    id: contexto.pagamento_id,
    assinatura_id: contexto.assinatura_id,
    gateway: contexto.gateway,
    gateway_payment_id: contexto.gateway_payment_id,
    valor: Number(contexto.pagamento_valor || contexto.plano_valor || 0),
    status: contexto.pagamento_status,
    data_pagamento: contexto.data_pagamento,
    competencia: getCompetencia(contexto),
  };

  const emissao = {
    id: emissaoId,
    cliente_id: contexto.cliente_id,
    assinatura_id: contexto.assinatura_id,
    pagamento_id: contexto.pagamento_id,
    numero_dps: numeroDps,
    serie_dps: serieDps,
    valor: pagamento.valor,
    competencia: pagamento.competencia,
    descricao_servico: buildDescricaoServico(plano, configuracaoNfse),
  };

  return { cliente, plano, pagamento, emissao };
}

export { NfseWorkflowError };

export function createNfseWorkflow({ dbPool }) {
  async function marcarErro(connection, emissaoId, error) {
    if (!emissaoId) return;

    await connection.execute(
      `UPDATE nfse_emissoes
       SET status = 'erro',
           erro_mensagem = :erroMensagem,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :emissaoId`,
      {
        emissaoId,
        erroMensagem: String(error?.message || "Erro ao gerar DPS.").slice(0, 1000),
      },
    );
  }

  async function criarNfseParaPagamento(pagamentoId) {
    const idPagamento = Number(pagamentoId);
    if (!Number.isInteger(idPagamento) || idPagamento <= 0) {
      throw new NfseWorkflowError("ID de pagamento invalido.", {
        status: 400,
        code: "INVALID_PAYMENT_ID",
      });
    }

    const emissaoExistenteAntes = await buscarEmissaoPorPagamento(dbPool, idPagamento);
    if (emissaoExistenteAntes) {
      if (emissaoExistenteAntes.status === "emitida" || emissaoExistenteAntes.status === "erro") {
        return emissaoExistenteAntes;
      }
      return enviarNfsePorEmissao(emissaoExistenteAntes.id);
    }

    const connection = await dbPool.getConnection();
    let emissaoId = null;

    try {
      await connection.beginTransaction();

      const contexto = await buscarContextoPagamento(connection, idPagamento);
      if (!contexto) {
        throw new NfseWorkflowError("Pagamento nao encontrado ou sem assinatura vinculada.", {
          status: 404,
          code: "PAYMENT_NOT_FOUND",
        });
      }

      const statusPagamento = normalizePaymentStatus(contexto.pagamento_status);
      if (!APPROVED_PAYMENT_STATUSES.has(statusPagamento)) {
        throw new NfseWorkflowError("Pagamento ainda nao esta aprovado para gerar NFS-e.", {
          status: 409,
          code: "PAYMENT_NOT_APPROVED",
        });
      }

      const [emissoes] = await connection.execute(
        `SELECT *
         FROM nfse_emissoes
         WHERE pagamento_id = :pagamentoId
         LIMIT 1
         FOR UPDATE`,
        { pagamentoId: idPagamento },
      );

      if (emissoes[0]) {
        await connection.commit();
        return emissoes[0];
      }

      if (Number(contexto.nfse_emitida) === 1) {
        throw new NfseWorkflowError("Pagamento ja esta marcado como NFS-e emitida.", {
          status: 409,
          code: "PAYMENT_ALREADY_MARKED",
        });
      }

      const [configRows] = await connection.execute("SELECT * FROM configuracoes_nfse WHERE id = 1 FOR UPDATE");
      const configuracaoNfse = configRows[0];
      if (!configuracaoNfse) {
        throw new NfseWorkflowError("Configuracao NFS-e inicial nao encontrada.", {
          status: 500,
          code: "NFSE_CONFIG_NOT_FOUND",
        });
      }

      const numeroDps = Number(configuracaoNfse.proximo_numero_dps || 357);
      const serieDps = String(configuracaoNfse.serie_dps || "1");
      const competencia = getCompetencia(contexto);
      const valor = Number(contexto.pagamento_valor || contexto.plano_valor || 0);
      const descricaoServico = buildDescricaoServico(
        {
          nome: contexto.plano_nome,
          descricao_nfse: contexto.plano_descricao_nfse,
        },
        configuracaoNfse,
      );

      const [insertResult] = await connection.execute(
        `INSERT INTO nfse_emissoes
          (cliente_id, assinatura_id, pagamento_id, numero_dps, serie_dps, valor, competencia, descricao_servico, status)
         VALUES
          (:clienteId, :assinaturaId, :pagamentoId, :numeroDps, :serieDps, :valor, :competencia, :descricaoServico, 'gerando_xml')`,
        {
          clienteId: contexto.cliente_id,
          assinaturaId: contexto.assinatura_id,
          pagamentoId: idPagamento,
          numeroDps,
          serieDps,
          valor,
          competencia,
          descricaoServico,
        },
      );
      emissaoId = insertResult.insertId;

      await connection.execute(
        `UPDATE configuracoes_nfse
         SET proximo_numero_dps = proximo_numero_dps + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = :configuracaoId`,
        { configuracaoId: configuracaoNfse.id },
      );

      const { cliente, plano, pagamento, emissao } = montarObjetosDominio(
        contexto,
        configuracaoNfse,
        numeroDps,
        serieDps,
        emissaoId,
      );

      const xml = gerarXmlDps({
        configuracaoNfse,
        cliente,
        plano,
        pagamento,
        emissao,
      });

      await connection.execute(
        `UPDATE nfse_emissoes
         SET status = 'dps_gerada',
             xml_dps = :xml,
             erro_mensagem = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = :emissaoId`,
        { emissaoId, xml },
      );

      await connection.commit();

      const [resultado] = await dbPool.execute(
        `SELECT *
         FROM nfse_emissoes
         WHERE id = :emissaoId
         LIMIT 1`,
        { emissaoId },
      );

      return enviarNfsePorEmissao(resultado[0].id);
    } catch (error) {
      if (emissaoId) {
        try {
          await marcarErro(connection, emissaoId, error);
          await connection.commit();
        } catch (markError) {
          await connection.rollback();
          console.error("Nao foi possivel salvar erro da emissao NFS-e:", {
            emissaoId,
            message: markError.message,
          });
        }

        throw new NfseWorkflowError(error.message || "Erro ao gerar DPS.", {
          status: error.status || 500,
          code: error.code || "NFSE_DPS_GENERATION_ERROR",
          emissaoId,
        });
      }

      await connection.rollback();

      if (error?.code === "ER_DUP_ENTRY") {
        const emissaoDuplicada = await buscarEmissaoPorPagamento(dbPool, idPagamento);
        if (emissaoDuplicada) return emissaoDuplicada;
      }

      throw error;
    } finally {
      connection.release();
    }
  }

  async function enviarNfsePorEmissao(emissaoId) {
    const idEmissao = Number(emissaoId);
    if (!Number.isInteger(idEmissao) || idEmissao <= 0) {
      throw new NfseWorkflowError("ID de emissao NFS-e invalido.", {
        status: 400,
        code: "INVALID_NFSE_ID",
      });
    }

    let invoice;
    const lockConnection = await dbPool.getConnection();

    try {
      await lockConnection.beginTransaction();

      const [rows] = await lockConnection.execute(
        `SELECT *
         FROM nfse_emissoes
         WHERE id = :emissaoId
         LIMIT 1
         FOR UPDATE`,
        { emissaoId: idEmissao },
      );

      invoice = rows[0];
      if (!invoice) {
        throw new NfseWorkflowError("Emissao NFS-e nao encontrada.", {
          status: 404,
          code: "NFSE_NOT_FOUND",
        });
      }

      if (invoice.status === "emitida") {
        await lockConnection.commit();
        return invoice;
      }

      if (!invoice.xml_dps) {
        throw new NfseWorkflowError("XML DPS precisa existir antes do envio real.", {
          status: 400,
          code: "NFSE_XML_DPS_REQUIRED",
          emissaoId: idEmissao,
        });
      }

      await lockConnection.execute(
        `UPDATE nfse_emissoes
         SET status = 'assinado',
             erro_mensagem = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = :emissaoId`,
        { emissaoId: idEmissao },
      );

      await lockConnection.commit();
    } catch (error) {
      await lockConnection.rollback();
      throw error;
    } finally {
      lockConnection.release();
    }

    try {
      const xmlDpsAssinado = await assinarXmlDps(invoice.xml_dps);

      await dbPool.execute(
        `UPDATE nfse_emissoes
         SET xml_dps_assinado = :xmlDpsAssinado,
             status = 'enviado',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = :emissaoId`,
        { emissaoId: idEmissao, xmlDpsAssinado },
      );

      const xmlNfse = await enviarDpsParaSefin(xmlDpsAssinado);
      const retorno = extrairRetornoNfse(xmlNfse);
      const finalStatus = retorno.status === "erro" || retorno.status === "rejeitado" ? "erro" : "emitida";

      await dbPool.execute(
        `UPDATE nfse_emissoes
         SET status = :status,
             xml_nfse = :xmlNfse,
             numero_nfse = :numeroNfse,
             chave_acesso = :chaveAcesso,
             codigo_verificacao = :codigoVerificacao,
             erro_mensagem = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = :emissaoId`,
        {
          emissaoId: idEmissao,
          status: finalStatus,
          xmlNfse,
          numeroNfse: retorno.numero_nfse,
          chaveAcesso: retorno.chave_acesso,
          codigoVerificacao: retorno.codigo_verificacao,
        },
      );

      if (finalStatus === "emitida" && invoice.pagamento_id) {
        await dbPool.execute(
          `UPDATE payments
           SET nfse_emitida = 1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = :pagamentoId`,
          { pagamentoId: invoice.pagamento_id },
        );
      }

      if (finalStatus === "emitida") {
        try {
          await enviarEmailDaEmissao(dbPool, idEmissao);
        } catch (emailError) {
          console.error("NFS-e emitida, mas e-mail nao foi enviado.", {
            emissaoId: idEmissao,
            message: emailError.message,
          });
        }
      }

      const [updatedRows] = await dbPool.execute(
        `SELECT *
         FROM nfse_emissoes
         WHERE id = :emissaoId
         LIMIT 1`,
        { emissaoId: idEmissao },
      );

      return updatedRows[0];
    } catch (error) {
      await dbPool.execute(
        `UPDATE nfse_emissoes
         SET status = 'erro',
             erro_mensagem = :erroMensagem,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = :emissaoId`,
        {
          emissaoId: idEmissao,
          erroMensagem: String(error?.responseBody || error?.message || "Erro ao enviar DPS para Sefin.").slice(0, 1000),
        },
      );

      throw new NfseWorkflowError(error.message || "Erro ao assinar/enviar DPS para Sefin.", {
        status: error.status || 500,
        code: error.code || "NFSE_SEND_ERROR",
        emissaoId: idEmissao,
      });
    }
  }

  return {
    criarNfseParaPagamento,
    enviarNfsePorEmissao,
  };
}

import { getNfseConfig, nfseIssuer } from "./config.js";

export function registerNfseRoutes(app, { nfseService, requireAdminSession }) {
  app.get("/api/nfse", requireAdminSession, async (request, response) => {
    try {
      const notas = await nfseService.listFiscalNotes({
        status: String(request.query.status || ""),
        limit: Number(request.query.limit || 120),
      });

      response.json({ notas });
    } catch (error) {
      console.error("Erro ao listar NFS-e:", error);
      response.status(500).json({ error: "Erro ao listar NFS-e." });
    }
  });

  app.get("/api/nfse/:id", requireAdminSession, async (request, response) => {
    try {
      const nota = await nfseService.getFiscalNote(Number(request.params.id));

      if (!nota) return response.status(404).json({ error: "NFS-e nao encontrada." });
      response.json({ nota });
    } catch (error) {
      console.error("Erro ao consultar NFS-e:", error);
      response.status(error.status || 500).json({ error: error.message || "Erro ao consultar NFS-e." });
    }
  });

  app.get("/api/nfse/:id/xml-dps", requireAdminSession, async (request, response) => {
    try {
      const xml = await nfseService.getFiscalNoteXml(Number(request.params.id), "xml_dps");

      response.setHeader("Content-Type", "application/xml; charset=utf-8");
      response.setHeader("Content-Disposition", `attachment; filename="nfse-${request.params.id}-dps.xml"`);
      response.send(xml);
    } catch (error) {
      response.status(error.status || 500).json({ error: error.message || "Erro ao baixar XML DPS." });
    }
  });

  app.get("/api/nfse/:id/xml-nfse", requireAdminSession, async (request, response) => {
    try {
      const xml = await nfseService.getFiscalNoteXml(Number(request.params.id), "xml_nfse");

      response.setHeader("Content-Type", "application/xml; charset=utf-8");
      response.setHeader("Content-Disposition", `attachment; filename="nfse-${request.params.id}.xml"`);
      response.send(xml);
    } catch (error) {
      response.status(error.status || 500).json({ error: error.message || "Erro ao baixar XML NFS-e." });
    }
  });

  app.post("/api/nfse/:id/reenviar-email", requireAdminSession, async (request, response) => {
    try {
      const result = await nfseService.reenviarEmail(Number(request.params.id));
      response.json({ ok: true, ...result });
    } catch (error) {
      console.error("Erro ao reenviar e-mail NFS-e:", error);
      response.status(error.status || 500).json({ ok: false, error: error.message || "Erro ao reenviar e-mail." });
    }
  });

  app.post("/api/nfse/:id/enviar-email", requireAdminSession, async (request, response) => {
    try {
      const result = await nfseService.reenviarEmail(Number(request.params.id));
      response.json({ ok: true, ...result });
    } catch (error) {
      console.error("Erro ao enviar e-mail NFS-e:", error);
      response.status(error.status || 500).json({ ok: false, error: error.message || "Erro ao enviar e-mail." });
    }
  });

  app.post("/api/nfse/:id/enviar", requireAdminSession, async (request, response) => {
    try {
      const emissao = await nfseService.enviarFiscalNote(Number(request.params.id));
      response.json({ ok: true, emissao });
    } catch (error) {
      console.error("Erro ao enviar NFS-e para Sefin:", {
        id: request.params.id,
        code: error.code,
        status: error.status,
        emissaoId: error.emissaoId,
        message: error.message,
      });
      response.status(error.status || 500).json({
        ok: false,
        error: error.message || "Erro ao enviar NFS-e.",
        code: error.code,
        emissaoId: error.emissaoId,
      });
    }
  });

  app.post("/api/nfse/:id/tentar-novamente", requireAdminSession, async (request, response) => {
    try {
      const emissao = await nfseService.retryFiscalNote(Number(request.params.id));
      response.json({ ok: true, emissao });
    } catch (error) {
      console.error("Erro ao tentar gerar NFS-e novamente:", error);
      response.status(error.status || 500).json({ ok: false, error: error.message || "Erro ao tentar novamente." });
    }
  });

  app.get("/api/admin/nfse/config", requireAdminSession, (_request, response) => {
    const config = getNfseConfig();

    response.json({
      issuer: nfseIssuer,
      config: {
        mock: config.mock,
        autoEmitir: config.autoEmitir,
        autoCreatePending: config.autoCreatePending,
        environment: config.environment,
        dpsSerie: config.dpsSerie,
        cnpjLookupConfigured: Boolean(config.cnpjLookupUrl),
        nacionalApiConfigured: Boolean(config.nacionalApiUrl),
        certConfigured: Boolean(config.certPath && config.certPasswordConfigured),
        emailProviderConfigured: Boolean(config.emailProvider),
      },
    });
  });

  app.post("/api/nfse/mock/gerar-dps", async (request, response) => {
    try {
      const config = getNfseConfig();

      if (!config.mock) {
        return response.status(403).json({
          ok: false,
          error: "Endpoint mock desativado. Ative NFSE_MOCK=true apenas em desenvolvimento.",
        });
      }

      const { clienteId, planoId, valor } = request.body || {};
      const result = await nfseService.generateMockDps({ clienteId, planoId, valor });

      response.json({
        ok: true,
        emissaoId: result.emissaoId,
        xml: result.xml,
      });
    } catch (error) {
      console.error("Erro ao gerar DPS mock:", {
        code: error.code,
        status: error.status,
        message: error.message,
      });

      response.status(error.status || 500).json({
        ok: false,
        error: error.message || "Erro ao gerar XML mock da DPS.",
        code: error.code,
      });
    }
  });

  app.post("/api/nfse/pagamento/:pagamentoId/gerar", async (request, response) => {
    try {
      const emissao = await nfseService.criarNfseParaPagamento(Number(request.params.pagamentoId));

      response.json({
        ok: true,
        emissao: {
          id: emissao.id,
          status: emissao.status,
          numero_dps: emissao.numero_dps,
        },
      });
    } catch (error) {
      console.error("Erro no workflow NFS-e por pagamento:", {
        pagamentoId: request.params.pagamentoId,
        code: error.code,
        status: error.status,
        emissaoId: error.emissaoId,
        message: error.message,
      });

      response.status(error.status || 500).json({
        ok: false,
        error: error.message || "Erro ao gerar NFS-e para pagamento.",
        code: error.code,
        emissaoId: error.emissaoId,
      });
    }
  });

  app.get("/api/admin/nfse/invoices", requireAdminSession, async (request, response) => {
    try {
      const invoices = await nfseService.listInvoices({
        status: String(request.query.status || ""),
        limit: Number(request.query.limit || 80),
      });

      response.json({ invoices });
    } catch (error) {
      console.error(error);
      response.status(500).json({ error: "Erro ao listar emissoes NFS-e." });
    }
  });

  app.get("/api/admin/nfse/invoices/:id", requireAdminSession, async (request, response) => {
    try {
      const invoice = await nfseService.getInvoice(Number(request.params.id));

      if (!invoice) return response.status(404).json({ error: "Emissao NFS-e nao encontrada." });
      response.json({ invoice });
    } catch (error) {
      console.error(error);
      response.status(500).json({ error: "Erro ao consultar emissao NFS-e." });
    }
  });

  app.post("/api/admin/nfse/subscriptions/:subscriptionId/pending", requireAdminSession, async (request, response) => {
    try {
      const result = await nfseService.createPendingForSubscription(Number(request.params.subscriptionId));
      response.json(result);
    } catch (error) {
      console.error(error);
      response.status(500).json({ error: error.message || "Erro ao criar emissao NFS-e pendente." });
    }
  });
}

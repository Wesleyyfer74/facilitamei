import { getNfseConfig, nfseIssuer } from "./config.js";

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

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

  app.get("/api/nfse/:id/pdf", requireAdminSession, async (request, response) => {
    try {
      const nota = await nfseService.getFiscalNote(Number(request.params.id));

      if (!nota) return response.status(404).send("NFS-e nao encontrada.");

      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.send(`<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>NFS-e ${escapeHtml(nota.numero_nfse || nota.numero_dps || nota.id)}</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 32px; color: #1f1b14; font-family: Arial, sans-serif; background: #f7f2e7; }
      .page { max-width: 860px; margin: 0 auto; padding: 34px; background: #fff; border: 1px solid #dcc88f; box-shadow: 0 18px 50px rgba(0,0,0,.12); }
      header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 3px solid #d6a331; padding-bottom: 22px; }
      h1 { margin: 0; font-size: 30px; }
      h2 { margin: 28px 0 12px; font-size: 18px; color: #8b681d; }
      p { margin: 5px 0; line-height: 1.45; }
      .badge { display: inline-block; padding: 8px 12px; border-radius: 999px; background: #fff4c7; font-weight: 700; color: #6b4b00; }
      .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 28px; }
      .box { border: 1px solid #ead9a8; border-radius: 10px; padding: 14px; background: #fffaf0; }
      .total { margin-top: 24px; padding: 18px; border-radius: 12px; background: #1f1b14; color: #fff; text-align: right; }
      .total strong { font-size: 30px; color: #ffd978; }
      .muted { color: #6f6655; }
      .actions { margin: 18px auto; max-width: 860px; text-align: right; }
      button { border: 0; border-radius: 999px; padding: 12px 18px; background: #d6a331; font-weight: 800; cursor: pointer; }
      @media print { body { background: #fff; padding: 0; } .page { box-shadow: none; border: 0; } .actions { display: none; } }
    </style>
  </head>
  <body>
    <div class="actions"><button onclick="window.print()">Salvar / imprimir PDF</button></div>
    <main class="page">
      <header>
        <div>
          <h1>NFS-e ${escapeHtml(nota.status === "emitida" ? "emitida" : "mock / demonstrativa")}</h1>
          <p class="muted">FACILITA ASSESSORIA E CONSULTORIA CONTABIL LTDA</p>
          <p>CNPJ: 41.952.830/0001-04</p>
        </div>
        <div>
          <span class="badge">${escapeHtml(nota.status || "-")}</span>
          <p><strong>DPS:</strong> ${escapeHtml(nota.serie_dps || "-")} / ${escapeHtml(nota.numero_dps || "-")}</p>
          <p><strong>NFS-e:</strong> ${escapeHtml(nota.numero_nfse || "-")}</p>
        </div>
      </header>

      <h2>Tomador</h2>
      <section class="grid">
        <div class="box"><strong>Razao social</strong><p>${escapeHtml(nota.cliente_razao_social || nota.cliente || "-")}</p></div>
        <div class="box"><strong>CNPJ</strong><p>${escapeHtml(nota.cliente_cnpj || "-")}</p></div>
        <div class="box"><strong>E-mail</strong><p>${escapeHtml(nota.cliente_email || "-")}</p></div>
        <div class="box"><strong>Municipio</strong><p>${escapeHtml([nota.cliente_municipio, nota.cliente_uf].filter(Boolean).join(" / ") || "-")}</p></div>
      </section>

      <h2>Servico</h2>
      <section class="box">
        <p><strong>Plano:</strong> ${escapeHtml(nota.plano || "Sem plano vinculado")}</p>
        <p><strong>Competencia:</strong> ${escapeHtml(nota.competencia || "-")}</p>
        <p><strong>Descricao:</strong> ${escapeHtml(nota.descricao_servico || "-")}</p>
      </section>

      <section class="total">
        <p>Valor dos servicos</p>
        <strong>${money(nota.valor)}</strong>
      </section>
    </main>
  </body>
</html>`);
    } catch (error) {
      console.error("Erro ao gerar PDF visual NFS-e:", error);
      response.status(error.status || 500).send(error.message || "Erro ao gerar PDF visual.");
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

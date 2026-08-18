import net from "node:net";

function serviceUnavailable(message, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), { status: 503 });
}

async function scanWithClamAv(buffer, { host, port, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const responseChunks = [];
    let settled = false;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      callback(value);
    };

    socket.setTimeout(timeoutMs);
    socket.on("connect", () => {
      socket.write(Buffer.from("zINSTREAM\0"));
      for (let offset = 0; offset < buffer.length; offset += 64 * 1024) {
        const chunk = buffer.subarray(offset, offset + 64 * 1024);
        const length = Buffer.alloc(4);
        length.writeUInt32BE(chunk.length);
        socket.write(length);
        socket.write(chunk);
      }
      socket.end(Buffer.alloc(4));
    });
    socket.on("data", (chunk) => responseChunks.push(chunk));
    socket.on("end", () => {
      const result = Buffer.concat(responseChunks).toString("utf8").replace(/\0/g, "").trim();
      if (/\bFOUND$/i.test(result)) {
        finish(reject, Object.assign(new Error("Arquivo bloqueado pelo antivirus."), { status: 400 }));
      } else if (/\bOK$/i.test(result)) {
        finish(resolve, { scanned: true, result });
      } else {
        finish(reject, serviceUnavailable("Resposta invalida do antivirus."));
      }
    });
    socket.on("timeout", () => finish(reject, serviceUnavailable("Tempo limite ao verificar o arquivo.")));
    socket.on("error", (error) => finish(reject, serviceUnavailable("Antivirus indisponivel.", error)));
  });
}

async function scanDocumentBuffer(buffer, options = {}) {
  const host = options.host ?? process.env.CLAMAV_HOST;
  const railwayProduction = Boolean(process.env.RAILWAY_ENVIRONMENT_ID || process.env.RAILWAY_SERVICE_ID);
  const required = options.required ?? (
    process.env.NODE_ENV === "production"
    || railwayProduction
    || process.env.FILE_ANTIVIRUS_REQUIRED === "true"
  );
  if (!host) {
    if (required) throw serviceUnavailable("CLAMAV_HOST e obrigatorio para verificar documentos.");
    return { scanned: false, reason: "not-configured" };
  }
  return scanWithClamAv(buffer, {
    host,
    port: Number(options.port ?? process.env.CLAMAV_PORT ?? 3310),
    timeoutMs: Number(options.timeoutMs ?? process.env.CLAMAV_TIMEOUT_MS ?? 15000),
  });
}

export { scanDocumentBuffer };

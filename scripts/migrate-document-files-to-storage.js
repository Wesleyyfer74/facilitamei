import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { validateUploadedDocument } from "../src/services/documentFileService.js";
import { createDocumentStorage, documentSha256 } from "../src/services/documentStorageService.js";
import { scanDocumentBuffer } from "../src/services/antivirusService.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
dotenv.config({ path: path.join(projectRoot, ".env") });

const storage = createDocumentStorage({ rootPath: path.join(projectRoot, "data", "private-documents") });
const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "facilita_modern",
  namedPlaceholders: true,
  connectionLimit: 2,
});

let migrated = 0;
try {
  while (true) {
    const [rows] = await pool.execute(
      `SELECT id, file_name, mime_type, base64_data
       FROM customer_document_files
       WHERE storage_key IS NULL AND base64_data IS NOT NULL
       ORDER BY id
       LIMIT 50`,
    );
    if (!rows.length) break;

    for (const row of rows) {
      const buffer = Buffer.from(String(row.base64_data), "base64");
      const validated = await validateUploadedDocument({ buffer, originalname: row.file_name });
      await scanDocumentBuffer(buffer);
      const storageKey = await storage.put({ buffer, ...validated });
      try {
        const [result] = await pool.execute(
          `UPDATE customer_document_files
           SET base64_data = NULL,
               storage_driver = :storageDriver,
               storage_key = :storageKey,
               file_size = :fileSize,
               sha256 = :sha256
           WHERE id = :id AND storage_key IS NULL`,
          {
            id: row.id,
            storageDriver: storage.driver,
            storageKey,
            fileSize: buffer.length,
            sha256: documentSha256(buffer),
          },
        );
        if (!result.affectedRows) await storage.delete(storageKey);
        else migrated += 1;
      } catch (error) {
        await storage.delete(storageKey).catch(() => {});
        throw error;
      }
    }
  }
  console.log(`Migracao concluida: ${migrated} documento(s).`);
} finally {
  await pool.end();
}

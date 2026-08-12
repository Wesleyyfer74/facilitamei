import crypto from "node:crypto";

function splitSqlStatements(sql) {
  return String(sql).split(/;\s*(?:\r?\n|$)/).map((statement) => statement.trim()).filter(Boolean);
}

function migrationChecksum(sql) {
  return crypto.createHash("sha256").update(String(sql)).digest("hex");
}

async function runSqlMigration(connection, { version, name, sql }) {
  const checksum = migrationChecksum(sql);
  const [rows] = await connection.execute("SELECT checksum FROM schema_migrations WHERE version = ? LIMIT 1", [version]);
  if (rows[0]) {
    if (rows[0].checksum !== checksum) throw new Error(`Migracao ${version} foi alterada depois de aplicada.`);
    return false;
  }
  for (const statement of splitSqlStatements(sql)) await connection.query(statement);
  await connection.execute(
    "INSERT INTO schema_migrations (version, name, checksum) VALUES (?, ?, ?)",
    [version, name, checksum],
  );
  return true;
}

export { migrationChecksum, runSqlMigration, splitSqlStatements };

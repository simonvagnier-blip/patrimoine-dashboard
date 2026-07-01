// Dump complet de la DB Turso en SQL (schéma + données) vers un fichier horodaté.
// Usage :  node scripts/backup-db.mjs [dossier-de-sortie]
// Sortie :  <dossier>/backup-YYYY-MM-DD-HHmmss.sql   (défaut : ../backups hors du repo git)
import { createClient } from "@libsql/client";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(file) {
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}
loadEnv(join(repoRoot, ".env.local"));

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url) {
  console.error("TURSO_DATABASE_URL manquant (.env.local)");
  process.exit(1);
}

const outDir = resolve(process.argv[2] ?? join(repoRoot, "..", "backups"));
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
const outFile = join(outDir, `backup-${stamp}.sql`);

const db = createClient({ url, authToken });

function sqlLiteral(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "bigint") return v.toString();
  if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
    const buf = Buffer.from(v instanceof ArrayBuffer ? v : v.buffer);
    return `X'${buf.toString("hex")}'`;
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}

const master = await db.execute(
  "SELECT name, sql, type FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%' AND name != 'libsql_wasm_func_table' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name"
);

let out = `-- Backup Turso ${url}\n-- Généré le ${new Date().toISOString()}\nPRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n`;
let totalRows = 0;

for (const row of master.rows) {
  if (row.type !== "table") continue;
  out += `\n${row.sql};\n`;
  const data = await db.execute(`SELECT * FROM "${row.name}"`);
  for (const r of data.rows) {
    const cols = data.columns.map((c) => `"${c}"`).join(", ");
    const vals = data.columns.map((c) => sqlLiteral(r[c])).join(", ");
    out += `INSERT INTO "${row.name}" (${cols}) VALUES (${vals});\n`;
  }
  totalRows += data.rows.length;
  console.log(`  ${row.name}: ${data.rows.length} lignes`);
}
for (const row of master.rows) {
  if (row.type === "table") continue;
  out += `\n${row.sql};\n`;
}
out += `\nCOMMIT;\nPRAGMA foreign_keys=ON;\n`;

writeFileSync(outFile, out);
console.log(`\n✅ Backup complet : ${outFile} (${totalRows} lignes)`);
console.log(`Restauration locale test :  sqlite3 restore-test.db < "${outFile}"`);
db.close();

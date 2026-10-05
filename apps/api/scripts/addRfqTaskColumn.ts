import { sql } from "drizzle-orm";
import { db } from "../src/db/client.js";

await db.execute(sql`ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS task_id uuid`);
await db.execute(sql`
  CREATE UNIQUE INDEX IF NOT EXISTS rfqs_task_supplier_uniq
  ON rfqs (task_id, supplier_id) WHERE task_id IS NOT NULL
`);
console.log("done");
process.exit(0);
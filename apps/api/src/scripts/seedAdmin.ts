import "dotenv/config";
import { db } from "../db/client.js";
import { admins } from "../db/adminSchema.js";
import { hashPassword } from "../agent/lib/supplierAuth.js";

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  const name = process.argv[4] ?? "Admin";

  if (!email || !password) {
    console.error("Usage: tsx src/scripts/seedAdmin.ts <email> <password> [name]");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters");
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const [admin] = await db
    .insert(admins)
    .values({ email, passwordHash, name, role: "super_admin" })
    .returning();

  console.log("Admin created:", admin.email, admin.id);
  process.exit(0);
}

main();
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: [
    "./src/db/schema.ts",
    "./src/db/procurementSchema.ts",
    "./src/db/supplyChainSchema.ts",
    "./src/db/suppliersSchema.ts",
    "./src/db/supplierMessagesSchema.ts",
    // drizzle.config.ts
  "./src/db/schema.ts",
  "./src/db/procurementSchema.ts",
  "./src/db/supplyChainSchema.ts",
  "./src/db/suppliersSchema.ts",
  "./src/db/supplierMessagesSchema.ts",
  "./src/db/adminSchema.ts",   // add this
],

dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});


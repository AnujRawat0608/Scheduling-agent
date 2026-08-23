import { defineConfig } from "drizzle-kit";

export default defineConfig({
schema: ["./src/db/schema.ts", "./src/db/procurementSchema.ts", "./src/db/supplyChainSchema.ts"],  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});

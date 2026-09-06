import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const queryClient = postgres(connectionString, {
  idle_timeout: 20, // close idle connections ourselves before the pooler does it for us
  max_lifetime: 60 * 30, // recycle every 30 min regardless
  connect_timeout: 10,
});
export const db = drizzle(queryClient, { schema });

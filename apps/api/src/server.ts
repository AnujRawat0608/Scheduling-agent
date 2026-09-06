import cors from "cors";
import "dotenv/config";
import express from "express";
import { runsRouter } from "./routes/runs.js";
import { authRouter } from "./routes/auth.js";
import { procurementRouter } from "./routes/procurement.js";
import { supplyChainRouter } from "./routes/supplyChain.js";

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection (server stays up):", err);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception (server stays up):", err);
});

const app = express();
app.use(cors({ origin: process.env.WEB_APP_URL ?? "http://localhost:3000" }));
app.use(express.json());
app.use("/api", runsRouter);
app.use("/auth", authRouter);
app.use("/api", procurementRouter);
app.use("/api", supplyChainRouter);

app.get("/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT ?? 3001;
app.listen(port, () => {
  console.log(`API listening on :${port}`);
});

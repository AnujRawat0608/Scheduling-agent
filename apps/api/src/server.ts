import cors from "cors";
import cookieParser from "cookie-parser";
import "dotenv/config";
import express from "express";
import { runsRouter } from "./routes/runs.js";
import { authRouter } from "./routes/auth.js";
import { procurementRouter } from "./routes/procurement.js";
import { supplyChainRouter } from "./routes/supplyChain.js";
import { supplierAuthRouter } from "./routes/supplierAuth.js";

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection (server stays up):", err);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception (server stays up):", err);
});

const app = express();

// `credentials: true` is required for the supplier login cookie
// (httpOnly) to actually be sent/received across origins — without it,
// the browser silently drops the Set-Cookie header on cross-origin
// responses even though the request itself succeeds.
app.use(
  cors({
    origin: process.env.WEB_APP_URL ?? "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

app.use("/api", runsRouter);
app.use("/auth", authRouter);
app.use("/api", procurementRouter);
app.use("/api", supplyChainRouter);
app.use("/api/supplier-auth", supplierAuthRouter);

app.get("/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT ?? 3001;
app.listen(port, () => {
  console.log(`API listening on :${port}`);
});
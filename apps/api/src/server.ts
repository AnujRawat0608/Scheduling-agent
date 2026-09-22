import cors from "cors";
import cookieParser from "cookie-parser";
import "dotenv/config";
import express from "express";
import { runsRouter } from "./routes/runs.js";
import { authRouter } from "./routes/auth.js";
import { procurementRouter } from "./routes/procurement.js";
import { supplyChainRouter } from "./routes/supplyChain.js";
import { supplierAuthRouter } from "./routes/supplierAuth.js";
import { supplierProfileRouter } from "./routes/supplierProfile.js";
import { supplierOrdersRouter } from "./routes/supplierOrders.js";
import { adminAuthRouter } from "./routes/adminAuth.js";
import { adminSuppliersRouter } from "./routes/adminSuppliers.js";


process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection (server stays up):", err);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception (server stays up):", err);
});

const app = express();

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
app.use("/api/suppliers", supplierProfileRouter);
app.use("/api", supplierOrdersRouter);
app.use("/api/admin-auth", adminAuthRouter);
app.use("/api/admin/suppliers", adminSuppliersRouter);

app.get("/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT ?? 3001;
app.listen(port, () => {
  console.log(`API listening on :${port}`);
});
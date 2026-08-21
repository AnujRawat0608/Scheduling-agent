import cors from "cors";
import "dotenv/config";
import express from "express";
import { runsRouter } from "./routes/runs.js";
import { authRouter } from "./routes/auth.js";

const app = express();
app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());
app.use("/api", runsRouter);
app.use("/auth", authRouter);

app.get("/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT ?? 3001;
app.listen(port, () => {
  console.log(`API listening on :${port}`);
});

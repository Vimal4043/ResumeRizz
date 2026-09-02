import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { rateLimit } from "express-rate-limit";
import { env } from "./config/env.js";
import {
  errorMiddleware,
  notFoundMiddleware,
} from "./middleware/errorMiddleware.js";
import healthRoutes from "./routes/healthRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import analysisRoutes from "./routes/analysisRoutes.js";

const app = express();

// Trust the first proxy hop so rate limiting + IP handling work correctly when
// the app is deployed behind a reverse proxy (e.g. nginx).
app.set("trust proxy", 1);

// ---------------------------------------------------------------------------
// Security, CORS, parsing, logging
// ---------------------------------------------------------------------------
app.use(helmet());
app.use(cors({ origin: env.clientUrl, credentials: true }));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

if (env.nodeEnv !== "test") {
  app.use(morgan(env.isProd ? "combined" : "dev"));
}

// Global API rate limiting (per-IP). Tighten per-route limits in later phases.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // requests per window per IP
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests, please try again later.",
  },
});
app.use("/api", apiLimiter);

// ---------------------------------------------------------------------------
// API routes → controllers (no business logic lives in these definitions)
// ---------------------------------------------------------------------------
app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/analysis", analysisRoutes);

// 404 + centralized error handling (always last)
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export { app };

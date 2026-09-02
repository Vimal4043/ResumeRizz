import { env } from "../config/env.js";

/** Health check used by the client (and tooling) to confirm the API is up. */
export function getHealth(_req, res) {
  return res.status(200).json({
    success: true,
    message: "ResumeRizz API is running",
    environment: env.nodeEnv,
  });
}

import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import { ValidationError } from "../utils/errors.js";

const ALLOWED_MIME_TYPES = ["application/pdf"];
// Centralized in config/env.js (MAX_UPLOAD_MB, default 5 MB) so the server and
// the frontend's MAX_FILE_SIZE_BYTES stay in sync from one place.
const MAX_FILE_SIZE_BYTES = env.maxUploadBytes;

// Ensure the uploads directory exists (resumes are git-ignored, only .gitkeep
// is tracked).
fs.mkdirSync(env.uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, env.uploadsDir),
  // Never trust the client-provided filename. Generate a safe random name with a
  // fixed extension that matches the validated PDF content.
  filename: (_req, _file, cb) => {
    const randomName = crypto.randomBytes(16).toString("hex");
    cb(null, `${randomName}.pdf`);
  },
});

function fileFilter(_req, file, cb) {
  const extension = path.extname(file.originalname).toLowerCase();
  // Validate both the reported MIME type and the extension so a mislabeled file
  // cannot slip through.
  if (file.mimetype !== "application/pdf" || extension !== ".pdf") {
    return cb(new ValidationError("Only PDF files are allowed."));
  }
  return cb(null, true);
}

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter,
});

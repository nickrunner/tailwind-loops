import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { RegisterRoutes } from "../build/routes.js";
import { errorHandler } from "./middleware/error-handler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function createApp(): express.Express {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Serve OpenAPI spec
  app.get("/api-docs", (_req, res) => {
    const specPath = resolve(__dirname, "..", "build", "swagger.json");
    const spec = JSON.parse(readFileSync(specPath, "utf-8"));
    res.json(spec);
  });

  // Register TSOA-generated routes
  RegisterRoutes(app);

  // Error handler (must be after routes)
  app.use(errorHandler);

  return app;
}

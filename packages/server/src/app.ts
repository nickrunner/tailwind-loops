import express from "express";
import cors from "cors";
import { RegisterRoutes } from "../build/routes.js";
import { errorHandler } from "./middleware/error-handler.js";

export function createApp(): express.Express {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Register TSOA-generated routes
  RegisterRoutes(app);

  // Error handler (must be after routes)
  app.use(errorHandler);

  return app;
}

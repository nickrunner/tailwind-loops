import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = process.env["API_URL"] ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3456,
    proxy: {
      "/api": apiTarget,
      "/health": apiTarget,
    },
  },
});

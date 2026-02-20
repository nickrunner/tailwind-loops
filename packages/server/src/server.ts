import { createApp } from "./app.js";

const PORT = parseInt(process.env["PORT"] ?? "3000", 10);

const app = createApp();

app.listen(PORT, () => {
  console.log(`\nTailwind Loops API server running at http://localhost:${PORT}`);
  console.log(`OpenAPI spec: http://localhost:${PORT}/api-docs\n`);
});

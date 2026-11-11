// Load .env locally; in CI the variables come from the workflow
try {
  process.loadEnvFile();
} catch {
  /* no .env file */
}
process.env.NODE_ENV = "test";

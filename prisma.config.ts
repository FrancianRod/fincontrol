import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  // Migrações e `db seed` (CLI) usam a conexão direta/sessão (porta 5432):
  // o pooler em modo transação (6543, DATABASE_URL) não suporta migrações.
  datasource: {
    url: env("DIRECT_URL"),
  },
});

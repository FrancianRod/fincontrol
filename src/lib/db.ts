import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não definida (veja .env.example)");
  // DATABASE_URL = pooler do Supabase (Supavisor, modo transação, porta 6543).
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

// Reaproveita a instância entre hot-reloads no dev.
export const db = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

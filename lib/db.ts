import { PrismaClient } from "@prisma/client";

// Singleton chuẩn cho Next.js dev (tránh mở quá nhiều connection khi hot-reload).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

import { PrismaClient } from "@prisma/client";

export { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["query", "info", "warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export const getPrismaClient = (): PrismaClient => prisma;

export const disconnectPrisma = async (): Promise<void> => {
  await prisma.$disconnect();
  console.log("📦 Disconnected from MongoDB via Prisma");
};

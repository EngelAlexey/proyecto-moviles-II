import { PrismaClient } from '@prisma/client';

export { PrismaClient };

/**
 * PrismaService - Singleton para evitar saturar el pool de conexiones en desarrollo.
 * MongoDB requiere un manejo cuidadoso debido a los límites de conexiones concurrentes en Atlas.
 */

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Retorna la instancia única de PrismaClient.
 */
export const getPrismaClient = () => prisma;

/**
 * Manejo del ciclo de vida del proceso para desconectar Prisma limpiamente.
 */
export const disconnectPrisma = async () => {
  await prisma.$disconnect();
  console.log('📦 Disconnected from MongoDB via Prisma');
};

// Listeners globales para procesos
process.on('SIGINT', async () => {
  await disconnectPrisma();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectPrisma();
  process.exit(0);
});

export default prisma;

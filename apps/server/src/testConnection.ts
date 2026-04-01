import 'dotenv/config';
import { prisma } from '../prisma/PrismaService';

/**
 * Script de prueba para verificar la conexión a MongoDB Atlas vía Prisma.
 */

async function testConnection() {
  console.log('⏳ Connecting to MongoDB Atlas via Prisma...');

  try {
    // Intentamos conectar
    await prisma.$connect();
    
    // Hacemos una operación simple: contar jugadores
    const playerCount = await prisma.playerModel.count();
    
    console.log('✅ Conexión exitosa a MongoDB');
    console.log(`📊 Jugadores encontrados en la base de datos: ${playerCount}`);

  } catch (error) {
    console.error('❌ Error al intentar conectar con MongoDB:');
    console.error(error);
    process.exit(1);
  } finally {
    // Desconectamos para liberar el recurso
    await prisma.$disconnect();
    process.exit(0);
  }
}

testConnection();

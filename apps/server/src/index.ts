import "dotenv/config";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { getPrismaClient, disconnectPrisma } from "./prisma/PrismaService.js";
import { RedisService } from "./services/redis.service.js";
import { GameCoordinator } from "./services/game-coordinator.js";
import { SocketHandler } from "./services/socket-handler.js";

// ─── Configuración ───────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 4000;

// ─── Express + HTTP ──────────────────────────────────────────────────────────

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ─── Socket.IO ───────────────────────────────────────────────────────────────

const io = new Server(server, {
  cors: { origin: "*" },
});

// ─── Servicios ───────────────────────────────────────────────────────────────

const prisma = getPrismaClient();
const redisService = new RedisService();
const coordinator = new GameCoordinator(prisma, redisService);
const socketHandler = new SocketHandler(io, coordinator);

socketHandler.initialize();

// ─── Inicio del servidor ─────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`[Server] Dado Triple corriendo en puerto ${PORT}`);
});

// ─── Graceful shutdown ───────────────────────────────────────────────────────

async function shutdown(): Promise<void> {
  console.log("\n[Server] Cerrando conexiones...");
  io.close();
  await redisService.disconnect();
  await disconnectPrisma();
  server.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

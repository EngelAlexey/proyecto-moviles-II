import Redis from "ioredis";
import type { GameState } from "@dado-triple/shared-types";

const KEY_PREFIX = "game:";
const DEFAULT_TTL = 3600; // 1 hora

export class RedisService {
  private client: Redis;

  constructor(url: string = process.env.REDIS_URL ?? "redis://localhost:6379") {
    this.client = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        if (times > 5) return null; // dejar de reintentar
        return Math.min(times * 200, 2000);
      },
    });

    this.client.on("error", (err: Error) => {
      console.error("[RedisService] Error de conexión:", err.message);
    });
  }

  /** Guarda el GameState completo serializado como JSON. */
  async saveGameState(roomId: string, state: GameState): Promise<void> {
    const key = `${KEY_PREFIX}${roomId}`;
    await this.client.set(key, JSON.stringify(state), "EX", DEFAULT_TTL);
  }

  /** Recupera el GameState por ID de sala. Devuelve null si no existe. */
  async getGameState(roomId: string): Promise<GameState | null> {
    const key = `${KEY_PREFIX}${roomId}`;
    const raw = await this.client.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as GameState;
  }

  /** Elimina el estado de una sala (cuando la partida termina). */
  async deleteGameState(roomId: string): Promise<void> {
    const key = `${KEY_PREFIX}${roomId}`;
    await this.client.del(key);
  }

  /** Cierra la conexión limpiamente. */
  async disconnect(): Promise<void> {
    await this.client.quit();
  }

  /** Expone el cliente para usos avanzados (pub/sub, etc.). */
  getClient(): Redis {
    return this.client;
  }
}

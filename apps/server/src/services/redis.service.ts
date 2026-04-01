import Redis from "ioredis";
import type { GameState } from "@dado-triple/shared-types";

const KEY_PREFIX = "game:";
const DEFAULT_TTL = 3600; // 1 hora

/**
 * Interface para estandarizar las operaciones de persistencia de estado.
 */
interface GameStateRepository {
  saveGameState(roomId: string, state: GameState): Promise<void>;
  getGameState(roomId: string): Promise<GameState | null>;
  deleteGameState(roomId: string): Promise<void>;
  disconnect(): Promise<void>;
}

/**
 * Estrategia In-Memory (RAM) para entornos locales o fallos de conexión.
 */
class InMemoryStrategy implements GameStateRepository {
  private store = new Map<string, { state: GameState; expiry: number }>();

  async saveGameState(roomId: string, state: GameState): Promise<void> {
    const expiry = Date.now() + DEFAULT_TTL * 1000;
    this.store.set(roomId, { state, expiry });
  }

  async getGameState(roomId: string): Promise<GameState | null> {
    const item = this.store.get(roomId);
    if (!item) return null;
    if (Date.now() > item.expiry) {
      this.store.delete(roomId);
      return null;
    }
    return item.state;
  }

  async deleteGameState(roomId: string): Promise<void> {
    this.store.delete(roomId);
  }

  async disconnect(): Promise<void> {
    this.store.clear();
  }
}

/**
 * Estrategia Redis (External) usando ioredis.
 */
class RedisStrategy implements GameStateRepository {
  private client: Redis;

  constructor(url: string) {
    this.client = new Redis(url, {
      maxRetriesPerRequest: 1, // Fallback rápido
      connectTimeout: 2000,   // 2 segundos para conectar
      retryStrategy(times: number) {
        if (times > 1) return null; // No reintentar, delegar al fallback
        return 100;
      },
    });

    this.client.on("error", (err: Error) => {
      console.warn("[RedisStrategy] Error o desconexión detectada:", err.message);
    });
  }

  async saveGameState(roomId: string, state: GameState): Promise<void> {
    const key = `${KEY_PREFIX}${roomId}`;
    await this.client.set(key, JSON.stringify(state), "EX", DEFAULT_TTL);
  }

  async getGameState(roomId: string): Promise<GameState | null> {
    const key = `${KEY_PREFIX}${roomId}`;
    const raw = await this.client.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as GameState;
  }

  async deleteGameState(roomId: string): Promise<void> {
    const key = `${KEY_PREFIX}${roomId}`;
    await this.client.del(key);
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }

  getClient(): Redis {
    return this.client;
  }
}

/**
 * RedisService - Orquestador con Fallback In-Memory automático.
 * Intenta conectar a Redis, pero si falla, usa la RAM sin romper la aplicación.
 */
export class RedisService {
  private repository: GameStateRepository;
  private isUsingMemory: boolean = false;

  constructor() {
    // 1. Prioridad: REDIS_URL (Formato rediss:// para TLS)
    // 2. Mapeo: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN -> TCP URL
    let redisUrl = process.env.REDIS_URL;

    if (!redisUrl && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      const host = process.env.UPSTASH_REDIS_REST_URL.replace("https://", "");
      const pass = process.env.UPSTASH_REDIS_REST_TOKEN;
      redisUrl = `rediss://default:${pass}@${host}:6379`;
    }

    if (redisUrl) {
      this.repository = new RedisStrategy(redisUrl);
      console.log("[RedisService] Intentando conectar a Redis Externo...");
      
      // Verificación rápida de disponibilidad
      (this.repository as RedisStrategy).getClient().on("error", () => {
        if (!this.isUsingMemory) {
          this.switchToMemory();
        }
      });
    } else {
      this.repository = new InMemoryStrategy();
      this.isUsingMemory = true;
      console.info("[RedisService] No se encontró configuración de Redis. Usando modo In-Memory (RAM).");
    }
  }

  private switchToMemory() {
    console.warn("⚠️ [RedisService] La conexión a Redis falló. Cambiando a Fallback In-Memory (RAM)...");
    this.repository = new InMemoryStrategy();
    this.isUsingMemory = true;
  }

  async saveGameState(roomId: string, state: GameState): Promise<void> {
    try {
      await this.repository.saveGameState(roomId, state);
    } catch (err) {
      if (!this.isUsingMemory) {
        this.switchToMemory();
        await this.repository.saveGameState(roomId, state);
      }
    }
  }

  async getGameState(roomId: string): Promise<GameState | null> {
    try {
      return await this.repository.getGameState(roomId);
    } catch (err) {
      if (!this.isUsingMemory) {
        this.switchToMemory();
        return null;
      }
      return null;
    }
  }

  async deleteGameState(roomId: string): Promise<void> {
    try {
      await this.repository.deleteGameState(roomId);
    } catch (err) {
      if (!this.isUsingMemory) {
        this.switchToMemory();
      }
    }
  }

  async disconnect(): Promise<void> {
    await this.repository.disconnect();
  }

  /** Informa si el sistema está operando en RAM o en Redis. */
  getStatus(): string {
    return this.isUsingMemory ? "Memory (Local RAM)" : "Redis (Cloud)";
  }
}

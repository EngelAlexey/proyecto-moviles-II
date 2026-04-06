import { Redis } from "ioredis";
import { Redis as UpstashRedis } from "@upstash/redis";
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
      connectTimeout: 5000,   // Un poco más para Cloud
      tls: url.startsWith("rediss://") ? { rejectUnauthorized: false } : undefined,
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
 * Estrategia Upstash (REST/HTTP) para entornos con restricciones de red (ISP/Firewall).
 */
class UpstashRestStrategy implements GameStateRepository {
  private client: UpstashRedis;

  constructor(url: string, token: string) {
    this.client = new UpstashRedis({
      url,
      token,
    });
  }

  async saveGameState(roomId: string, state: GameState): Promise<void> {
    const key = `${KEY_PREFIX}${roomId}`;
    await this.client.set(key, JSON.stringify(state), { ex: DEFAULT_TTL });
  }

  async getGameState(roomId: string): Promise<GameState | null> {
    const key = `${KEY_PREFIX}${roomId}`;
    const raw = await this.client.get<string | GameState>(key);
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  }

  async deleteGameState(roomId: string): Promise<void> {
    const key = `${KEY_PREFIX}${roomId}`;
    await this.client.del(key);
  }

  async disconnect(): Promise<void> {
    // REST no mantiene conexiones persistentes, no requiere quit()
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
    // 1. Prioridad: REDIS_URL (Formato rediss:// para TCP Local/Generic)
    // 2. Mapeo: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN -> HTTP REST
    let redisUrl = process.env.REDIS_URL;

    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      console.log("[RedisService] Usando Upstash (REST/HTTP) para máxima estabilidad.");
      this.repository = new UpstashRestStrategy(
        process.env.UPSTASH_REDIS_REST_URL,
        process.env.UPSTASH_REDIS_REST_TOKEN,
      );
    } else if (redisUrl) {
      this.repository = new RedisStrategy(redisUrl);
      console.log("[RedisService] Intentando conectar a Redis Externo (TCP)...");
      
      // Verificación rápida de disponibilidad (solo para TCP)
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
    if (this.isUsingMemory) return "Memory (Local RAM)";
    if (this.repository instanceof UpstashRestStrategy) return "Upstash (REST/HTTP)";
    return "Redis (TCP Cloud)";
  }
}

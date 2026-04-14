import type { PrismaClient } from "@prisma/client";
import type {
  DiceValues,
  DiceCombo,
  GameState,
  GameStatus,
  Player,
  Pair,
  DiceRolledPayload,
  RoundResultPayload,
  PairsAssignedPayload,
  GameOverPayload,
} from "@dado-triple/shared-types";
import {
  rollDice,
  getDiceCombo,
  calculateScore,
  pairPlayers,
  MIN_PLAYERS,
  MAX_PLAYERS,
} from "@dado-triple/game-logic";
import { RedisService } from "./redis.service.js";

// ─── Tipos internos ──────────────────────────────────────────────────────────

interface DiceResult {
  dice: DiceValues;
  combo: DiceCombo;
  score: number;
}

// ─── Coordinator ─────────────────────────────────────────────────────────────

export class GameCoordinator {
  constructor(
    private prisma: PrismaClient,
    private redis: RedisService,
  ) {}

  // ── Creación de sala ─────────────────────────────────────────────────────

  /** Crea una nueva sesión de juego en Redis y Prisma. */
  async createSession(roomId: string, maxRounds: number = 5): Promise<GameState> {
    const session = await this.prisma.gameSessionModel.create({
      data: { status: "waiting" },
    });

    const state: GameState = {
      sessionId: session.id,
      players: [],
      pairs: [],
      currentDice: [0, 0, 0],
      status: "waiting",
      round: 0,
      maxRounds,
    };

    await this.redis.saveGameState(roomId, state);
    return state;
  }

  // ── Unirse a la sala ─────────────────────────────────────────────────────

  /** Registra un jugador en la sesión. Retorna el Player creado y el estado actualizado. */
  async addPlayer(
    roomId: string,
    playerName: string,
  ): Promise<{ player: Player; state: GameState }> {
    const state = await this.requireState(roomId);

    // 1. EVITAR DUPLICADOS / PERMITIR RECONEXIÓN (por nombre de usuario)
    const existingPlayer = state.players.find((p) => p.name === playerName);
    if (existingPlayer) {
      console.log(`[GameCoordinator] Re-conectando jugador existente: ${playerName}`);
      return { player: existingPlayer, state };
    }

    // 2. Si es un jugador nuevo, solo puede entrar si la partida NO ha comenzado
    if (state.status !== "waiting") {
      throw new Error("La partida ya comenzó. No se pueden unir más jugadores nuevos.");
    }

    if (state.players.length >= MAX_PLAYERS) {
      throw new Error(`Máximo ${MAX_PLAYERS} jugadores permitidos.`);
    }

    // Upsert en Prisma
    const dbPlayer = await this.prisma.playerModel.upsert({
      where: { username: playerName },
      update: {},
      create: { username: playerName },
    });

    const player: Player = {
      id: dbPlayer.id,
      name: playerName,
      score: 0,
      isReady: false,
    };

    state.players.push(player);
    await this.redis.saveGameState(roomId, state);

    return { player, state };
  }

  // ── Marcar jugador como listo ────────────────────────────────────────────

  async setPlayerReady(roomId: string, playerId: string): Promise<GameState> {
    const state = await this.requireState(roomId);

    const player = state.players.find((p) => p.id === playerId);
    if (!player) throw new Error("Jugador no encontrado en la sala.");

    player.isReady = true;
    await this.redis.saveGameState(roomId, state);
    return state;
  }

  // ── Iniciar partida y emparejar ──────────────────────────────────────────

  /** Intenta iniciar la partida si todos los jugadores están listos y hay suficientes. */
  async tryStartGame(roomId: string): Promise<PairsAssignedPayload | null> {
    const state = await this.requireState(roomId);

    if (state.players.length < MIN_PLAYERS) {
      console.log(`[GameCoordinator] No hay suficientes jugadores en ${roomId} (actual: ${state.players.length})`);
      return null;
    }

    const unreadyPlayers = state.players.filter((p) => !p.isReady).map((p) => p.name);
    if (unreadyPlayers.length > 0) {
      console.log(`[GameCoordinator] Esperando a: ${unreadyPlayers.join(", ")} en ${roomId}`);
      return null;
    }

    state.status = "playing";
    state.round = 1;

    const playerIds = state.players.map((p) => p.id);
    const { pairs, bye } = pairPlayers(playerIds);
    state.pairs = pairs;

    // Actualizar Prisma
    await this.prisma.gameSessionModel.update({
      where: { id: state.sessionId },
      data: { status: "playing" },
    });

    await this.redis.saveGameState(roomId, state);

    return { pairs, bye, round: state.round };
  }

  // ── Tiro de dados ────────────────────────────────────────────────────────

  /**
   * Procesa un tiro de dados para un jugador.
   * 1. Recupera estado de Redis.
   * 2. Calcula resultado con game-logic.
   * 3. Actualiza estado en Redis.
   * 4. Persiste el movimiento en Prisma (async, no bloqueante).
   */
  async handleDiceRoll(
    roomId: string,
    playerId: string,
  ): Promise<DiceRolledPayload> {
    const state = await this.requireState(roomId);

    if (state.status !== "playing") {
      throw new Error("La partida no está en curso.");
    }

    const playerInGame = state.players.find((p) => p.id === playerId);
    if (!playerInGame) throw new Error("Jugador no encontrado en la sala.");

    // Motor puro
    const dice = rollDice();
    const combo = getDiceCombo(dice);
    const score = calculateScore(dice);

    // Actualizar estado en Redis
    playerInGame.score += score;
    state.currentDice = dice;
    await this.redis.saveGameState(roomId, state);

    // Persistir movimiento en Prisma (fire-and-forget, no bloquea el hilo)
    this.persistMovement(state.sessionId, playerId, dice, combo, score);

    return { playerId, dice, combo, score };
  }

  // ── Resolución de ronda ──────────────────────────────────────────────────

  /** Evalúa el resultado de una pareja en la ronda actual. */
  evaluateRound(state: GameState, pair: Pair): RoundResultPayload {
    const p1 = state.players.find((p) => p.id === pair.player1Id);
    const p2 = state.players.find((p) => p.id === pair.player2Id);

    if (!p1 || !p2) throw new Error("Jugadores del par no encontrados.");

    let winnerId: string | null = null;
    if (p1.score > p2.score) winnerId = p1.id;
    else if (p2.score > p1.score) winnerId = p2.id;

    return {
      pair,
      scores: { player1: p1.score, player2: p2.score },
      winnerId,
    };
  }

  // ── Avanzar ronda ────────────────────────────────────────────────────────

  async advanceRound(roomId: string): Promise<PairsAssignedPayload | GameOverPayload> {
    const state = await this.requireState(roomId);
    state.round += 1;

    if (state.round > state.maxRounds) {
      return this.endGame(roomId, state);
    }

    // Re-emparejar
    const playerIds = state.players.map((p) => p.id);
    const { pairs, bye } = pairPlayers(playerIds);
    state.pairs = pairs;

    await this.redis.saveGameState(roomId, state);
    return { pairs, bye, round: state.round };
  }

  // ── Finalización ─────────────────────────────────────────────────────────

  private async endGame(roomId: string, state: GameState): Promise<GameOverPayload> {
    state.status = "finished";

    const finalScores: Record<string, number> = {};
    let winnerId = state.players[0]?.id ?? "";
    let maxScore = -1;

    for (const p of state.players) {
      finalScores[p.id] = p.score;
      if (p.score > maxScore) {
        maxScore = p.score;
        winnerId = p.id;
      }
    }

    // Actualizar Prisma
    await this.prisma.gameSessionModel.update({
      where: { id: state.sessionId },
      data: { status: "finished", endTime: new Date() },
    });

    // Actualizar totalScore de cada jugador
    const updates = state.players.map((p) =>
      this.prisma.playerModel.update({
        where: { id: p.id },
        data: { totalScore: { increment: p.score } },
      }),
    );
    await Promise.all(updates);

    // Limpiar Redis
    await this.redis.deleteGameState(roomId);

    return { finalScores, winnerId };
  }

  // ── Remover jugador ──────────────────────────────────────────────────────

  async removePlayer(roomId: string, playerId: string): Promise<GameState | null> {
    const state = await this.redis.getGameState(roomId);
    if (!state) return null;

    state.players = state.players.filter((p) => p.id !== playerId);

    if (state.players.length === 0) {
      await this.redis.deleteGameState(roomId);
      return null;
    }

    await this.redis.saveGameState(roomId, state);
    return state;
  }

  // ── Obtener estado ───────────────────────────────────────────────────────

  async getState(roomId: string): Promise<GameState | null> {
    return this.redis.getGameState(roomId);
  }

  // ── Helpers privados ─────────────────────────────────────────────────────

  /** Obtiene el estado o lanza error si la sala no existe. */
  private async requireState(roomId: string): Promise<GameState> {
    let state = await this.redis.getGameState(roomId);
    if (!state) throw new Error(`Sala "${roomId}" no encontrada.`);

    // SISTEMA DE AUTO-SANACIÓN (Deduplicación de jugadores corruptos en Redis)
    const uniquePlayers: Player[] = [];
    const seenIds = new Set<string>();

    for (const p of state.players) {
      if (!seenIds.has(p.id)) {
        seenIds.add(p.id);
        uniquePlayers.push(p);
      }
    }

    if (uniquePlayers.length !== state.players.length) {
      console.log(`[GameCoordinator] Auto-sanación: Limpiando ${state.players.length - uniquePlayers.length} duplicados en ${roomId}`);
      state.players = uniquePlayers;
      await this.redis.saveGameState(roomId, state);
    }

    return state;
  }

  /** Persiste un movimiento en MongoDB sin bloquear. */
  private persistMovement(
    sessionId: string,
    playerId: string,
    dice: DiceValues,
    combo: DiceCombo,
    score: number,
  ): void {
    this.prisma.movementModel
      .create({
        data: {
          sessionId,
          playerId,
          diceValues: [dice[0], dice[1], dice[2]],
          comboType: combo,
          scoreEarned: score,
        },
      })
      .catch((err: Error) => {
        console.error("[GameCoordinator] Error al persistir movimiento:", err.message);
      });
  }
}

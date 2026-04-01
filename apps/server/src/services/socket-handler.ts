import type { Server, Socket } from "socket.io";
import {
  SocketEvents,
  type JoinGamePayload,
  type ErrorPayload,
} from "@dado-triple/shared-types";
import type { GameCoordinator } from "./game-coordinator.js";

/**
 * Mapea los eventos de Socket.IO a los métodos del GameCoordinator.
 * Cada socket se une a una "room" identificada por roomId.
 */
export class SocketHandler {
  constructor(
    private io: Server,
    private coordinator: GameCoordinator,
  ) {}

  /** Registra todos los listeners en el servidor de Socket.IO. */
  initialize(): void {
    this.io.on("connection", (socket: Socket) => {
      console.log(`[Socket] Conectado: ${socket.id}`);

      socket.on(SocketEvents.JOIN_GAME, (payload: JoinGamePayload & { roomId: string }) =>
        this.onJoinGame(socket, payload),
      );

      socket.on(SocketEvents.PLAYER_READY, (payload: { roomId: string; playerId: string }) =>
        this.onPlayerReady(socket, payload),
      );

      socket.on(SocketEvents.ROLL_DICE, (payload: { roomId: string; playerId: string }) =>
        this.onRollDice(socket, payload),
      );

      socket.on("disconnect", () => this.onDisconnect(socket));
    });
  }

  // ── Handlers ─────────────────────────────────────────────────────────────

  private async onJoinGame(
    socket: Socket,
    payload: JoinGamePayload & { roomId: string },
  ): Promise<void> {
    const { roomId, playerName } = payload;

    try {
      // Crear sesión si no existe
      let state = await this.coordinator.getState(roomId);
      if (!state) {
        state = await this.coordinator.createSession(roomId);
      }

      const result = await this.coordinator.addPlayer(roomId, playerName);

      // Unir el socket a la sala de Socket.IO
      await socket.join(roomId);

      // Almacenar metadata en el socket para el disconnect
      socket.data.roomId = roomId;
      socket.data.playerId = result.player.id;

      // Notificar a la sala
      this.io.to(roomId).emit(SocketEvents.PLAYER_JOINED, {
        player: result.player,
        totalPlayers: result.state.players.length,
      });

      // Enviar estado actual al jugador que se unió
      socket.emit(SocketEvents.GAME_UPDATE, { state: result.state });
    } catch (err) {
      this.emitError(socket, err);
    }
  }

  private async onPlayerReady(
    socket: Socket,
    payload: { roomId: string; playerId: string },
  ): Promise<void> {
    const { roomId, playerId } = payload;

    try {
      const state = await this.coordinator.setPlayerReady(roomId, playerId);

      // Emitir estado actualizado
      this.io.to(roomId).emit(SocketEvents.GAME_UPDATE, { state });

      // Intentar iniciar si todos están listos
      const pairingResult = await this.coordinator.tryStartGame(roomId);
      if (pairingResult) {
        this.io.to(roomId).emit(SocketEvents.GAME_START, {});
        this.io.to(roomId).emit(SocketEvents.PAIRS_ASSIGNED, pairingResult);
      }
    } catch (err) {
      this.emitError(socket, err);
    }
  }

  private async onRollDice(
    socket: Socket,
    payload: { roomId: string; playerId: string },
  ): Promise<void> {
    const { roomId, playerId } = payload;

    try {
      const diceResult = await this.coordinator.handleDiceRoll(roomId, playerId);

      // Emitir resultado a toda la sala
      this.io.to(roomId).emit(SocketEvents.DICE_ROLLED, diceResult);

      // Emitir estado actualizado
      const state = await this.coordinator.getState(roomId);
      if (state) {
        this.io.to(roomId).emit(SocketEvents.GAME_UPDATE, { state });
      }
    } catch (err) {
      this.emitError(socket, err);
    }
  }

  private async onDisconnect(socket: Socket): Promise<void> {
    const roomId = socket.data.roomId as string | undefined;
    const playerId = socket.data.playerId as string | undefined;

    console.log(`[Socket] Desconectado: ${socket.id}`);

    if (!roomId || !playerId) return;

    try {
      const state = await this.coordinator.removePlayer(roomId, playerId);

      if (state) {
        this.io.to(roomId).emit(SocketEvents.PLAYER_LEFT, { playerId });
        this.io.to(roomId).emit(SocketEvents.GAME_UPDATE, { state });
      }
    } catch (err) {
      console.error("[SocketHandler] Error en disconnect:", err);
    }
  }

  // ── Utilidades ───────────────────────────────────────────────────────────

  private emitError(socket: Socket, err: unknown): void {
    const message = err instanceof Error ? err.message : "Error desconocido";
    const payload: ErrorPayload = { message };
    socket.emit(SocketEvents.ERROR, payload);
  }
}

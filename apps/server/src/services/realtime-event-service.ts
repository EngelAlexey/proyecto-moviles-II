import {
  SocketEvents,
  type ClientSocketMessage,
  type ServerSocketEventMap,
  type ServerSocketMessage,
} from "@dado-triple/shared-types";
import type { GameCoordinator } from "./game-coordinator.js";

export interface ConnectionContext {
  roomId?: string;
  playerId?: string;
}

export interface DispatchResult {
  nextContext?: ConnectionContext;
  effects: OutboundEffect[];
}

export type OutboundEffect =
  | {
      scope: "self";
      message: ServerSocketMessage;
    }
  | {
      scope: "room";
      roomId: string;
      message: ServerSocketMessage;
    };

/**
 * Servicio agnóstico al transporte.
 * Convierte mensajes entrantes del tiempo real en efectos de salida para
 * el cliente actual o para toda una sala.
 */
export class RealtimeEventService {
  constructor(private coordinator: GameCoordinator) {}

  async handleClientMessage(
    context: ConnectionContext,
    message: ClientSocketMessage,
  ): Promise<DispatchResult> {
    try {
      switch (message.event) {
        case SocketEvents.JOIN_GAME:
          return await this.handleJoinGame(message.payload);
        case SocketEvents.PLAYER_READY:
          return await this.handlePlayerReady(message.payload);
        case SocketEvents.ROLL_DICE:
          return await this.handleRollDice(message.payload);
        default:
          return this.withError("Evento no soportado.");
      }
    } catch (err) {
      const fallback = err instanceof Error ? err.message : "Error desconocido";
      return this.withError(fallback, context);
    }
  }

  async handleDisconnect(context: ConnectionContext): Promise<DispatchResult> {
    const { roomId, playerId } = context;

    if (!roomId || !playerId) {
      return { effects: [] };
    }

    try {
      const state = await this.coordinator.removePlayer(roomId, playerId);

      if (!state) {
        return { effects: [] };
      }

      return {
        effects: [
          this.toRoom(roomId, SocketEvents.PLAYER_LEFT, { playerId }),
          this.toRoom(roomId, SocketEvents.GAME_UPDATE, { state }),
        ],
      };
    } catch (err) {
      console.error("[RealtimeEventService] Error en disconnect:", err);
      return { effects: [] };
    }
  }

  private async handleJoinGame(
    payload: Extract<ClientSocketMessage, { event: SocketEvents.JOIN_GAME }>["payload"],
  ): Promise<DispatchResult> {
    const { roomId, playerName } = payload;

    let state = await this.coordinator.getState(roomId);
    if (!state || state.status === "finished") {
      state = await this.coordinator.createSession(roomId);
    }

    const result = await this.coordinator.addPlayer(roomId, playerName);

    return {
      nextContext: {
        roomId,
        playerId: result.player.id,
      },
      effects: [
        this.toRoom(roomId, SocketEvents.PLAYER_JOINED, {
          player: result.player,
          totalPlayers: result.state.players.length,
        }),
        this.toSelf(SocketEvents.GAME_UPDATE, { state: result.state }),
      ],
    };
  }

  private async handlePlayerReady(
    payload: Extract<ClientSocketMessage, { event: SocketEvents.PLAYER_READY }>["payload"],
  ): Promise<DispatchResult> {
    const { roomId, playerId } = payload;
    const state = await this.coordinator.setPlayerReady(roomId, playerId);

    const effects: OutboundEffect[] = [
      this.toRoom(roomId, SocketEvents.GAME_UPDATE, { state }),
    ];

    const pairingResult = await this.coordinator.tryStartGame(roomId);
    if (pairingResult) {
      effects.push(this.toRoom(roomId, SocketEvents.GAME_START, {}));
      effects.push(this.toRoom(roomId, SocketEvents.PAIRS_ASSIGNED, pairingResult));
    }

    return { effects };
  }

  private async handleRollDice(
    payload: Extract<ClientSocketMessage, { event: SocketEvents.ROLL_DICE }>["payload"],
  ): Promise<DispatchResult> {
    const { roomId, playerId } = payload;
    const diceResult = await this.coordinator.handleDiceRoll(roomId, playerId);

    const effects: OutboundEffect[] = [
      this.toRoom(roomId, SocketEvents.DICE_ROLLED, diceResult),
    ];

    const state = await this.coordinator.getState(roomId);
    if (state) {
      effects.push(this.toRoom(roomId, SocketEvents.GAME_UPDATE, { state }));
    }

    return { effects };
  }

  private withError(message: string, nextContext?: ConnectionContext): DispatchResult {
    return {
      nextContext,
      effects: [this.toSelf(SocketEvents.ERROR, { message })],
    };
  }

  private toSelf<Event extends keyof ServerSocketEventMap>(
    event: Event,
    payload: ServerSocketEventMap[Event],
  ): OutboundEffect {
    return {
      scope: "self",
      message: { event, payload } as ServerSocketMessage,
    };
  }

  private toRoom<Event extends keyof ServerSocketEventMap>(
    roomId: string,
    event: Event,
    payload: ServerSocketEventMap[Event],
  ): OutboundEffect {
    return {
      scope: "room",
      roomId,
      message: { event, payload } as ServerSocketMessage,
    };
  }
}

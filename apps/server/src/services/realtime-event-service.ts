import {
  SocketEvents,
  type ClientSocketMessage,
  type ConnectionRole,
  type GameState,
  type RoomSummary,
  type ServerSocketEventMap,
  type ServerSocketMessage,
} from "@dado-triple/shared-types";
import type { GameCoordinator } from "./game-coordinator.js";

export interface ConnectionContext {
  roomId?: string;
  playerId?: string;
  role?: ConnectionRole;
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

export class RealtimeEventService {
  private readonly observerCounts = new Map<string, number>();

  constructor(private coordinator: GameCoordinator) {}

  async handleClientMessage(
    context: ConnectionContext,
    message: ClientSocketMessage,
  ): Promise<DispatchResult> {
    try {
      switch (message.event) {
        case SocketEvents.CREATE_ROOM:
          return await this.handleCreateRoom(message.payload);
        case SocketEvents.JOIN_GAME:
          return await this.handleJoinGame(context, message.payload);
        case SocketEvents.JOIN_AS_OBSERVER:
          return await this.handleJoinAsObserver(context, message.payload);
        case SocketEvents.LIST_ROOMS:
          return await this.handleListRooms(message.payload);
        case SocketEvents.PLAYER_READY:
          return await this.handlePlayerReady(context, message.payload);
        case SocketEvents.ROLL_DICE:
          return await this.handleRollDice(context, message.payload);
        default:
          return this.withError("Evento no soportado.", context);
      }
    } catch (err) {
      const fallback = err instanceof Error ? err.message : "Error desconocido";
      return this.withError(fallback, context);
    }
  }

  async handleDisconnect(context: ConnectionContext): Promise<DispatchResult> {
    const { roomId, playerId, role } = context;

    if (!roomId) {
      return { effects: [] };
    }

    if (role === "observer") {
      this.decrementObserver(roomId);
      return { effects: [] };
    }

    if (!playerId) {
      return { effects: [] };
    }

    try {
      const state = await this.coordinator.removePlayer(roomId, playerId);
      const effects: OutboundEffect[] = [
        this.toRoom(roomId, SocketEvents.PLAYER_LEFT, { playerId }),
      ];

      if (state) {
        effects.push(this.toRoom(roomId, SocketEvents.GAME_UPDATE, { state }));
      }

      return { effects };
    } catch (err) {
      console.error("[RealtimeEventService] Error en disconnect:", err);
      return { effects: [] };
    }
  }

  private async handleCreateRoom(
    payload: Extract<ClientSocketMessage, { event: SocketEvents.CREATE_ROOM }>["payload"],
  ): Promise<DispatchResult> {
    const requestedRoomId = payload.roomId?.trim();
    const roomId = requestedRoomId || this.generateRoomId();
    const existingState = await this.coordinator.getState(roomId);

    if (existingState && existingState.status !== "finished") {
      return this.withError(`La sala "${roomId}" ya existe.`);
    }

    const maxRounds = this.normalizeMaxRounds(payload.maxRounds);
    const state = await this.coordinator.createSession(roomId, maxRounds);

    return {
      effects: [
        this.toSelf(SocketEvents.ROOM_CREATED, {
          room: this.toRoomSummary(roomId, state),
          state,
        }),
      ],
    };
  }

  private async handleJoinGame(
    context: ConnectionContext,
    payload: Extract<ClientSocketMessage, { event: SocketEvents.JOIN_GAME }>["payload"],
  ): Promise<DispatchResult> {
    const roomId = payload.roomId.trim();
    const playerName = payload.playerName.trim();

    if (!roomId) {
      return this.withError("Debes indicar un roomId valido.", context);
    }

    if (!playerName) {
      return this.withError("Debes indicar un nombre de jugador.", context);
    }

    let state = await this.coordinator.getState(roomId);
    if (!state || state.status === "finished") {
      state = await this.coordinator.createSession(roomId);
    }

    const transitionEffects = await this.prepareRoomTransition(context, roomId, "player");
    const result = await this.coordinator.addPlayer(roomId, playerName);

    return {
      nextContext: {
        roomId,
        playerId: result.player.id,
        role: "player",
      },
      effects: [
        ...transitionEffects,
        this.toRoom(roomId, SocketEvents.PLAYER_JOINED, {
          player: result.player,
          totalPlayers: result.state.players.length,
        }),
        this.toRoom(roomId, SocketEvents.GAME_UPDATE, { state: result.state }),
      ],
    };
  }

  private async handleJoinAsObserver(
    context: ConnectionContext,
    payload: Extract<ClientSocketMessage, { event: SocketEvents.JOIN_AS_OBSERVER }>["payload"],
  ): Promise<DispatchResult> {
    const roomId = payload.roomId.trim();
    if (!roomId) {
      return this.withError("Debes indicar un roomId valido.", context);
    }

    const state = await this.coordinator.getState(roomId);
    if (!state) {
      return this.withError(`La sala "${roomId}" no existe.`, context);
    }

    const transitionEffects = await this.prepareRoomTransition(context, roomId, "observer");
    const isSameObserverSession =
      context.role === "observer" && context.roomId === roomId;

    if (!isSameObserverSession) {
      this.incrementObserver(roomId);
    }

    return {
      nextContext: {
        roomId,
        playerId: undefined,
        role: "observer",
      },
      effects: [
        ...transitionEffects,
        this.toSelf(SocketEvents.GAME_UPDATE, { state }),
      ],
    };
  }

  private async handleListRooms(
    payload: Extract<ClientSocketMessage, { event: SocketEvents.LIST_ROOMS }>["payload"],
  ): Promise<DispatchResult> {
    const rooms = await this.listRooms(payload.includeFinished ?? false);

    return {
      effects: [this.toSelf(SocketEvents.ROOMS_LIST, { rooms })],
    };
  }

  private async handlePlayerReady(
    context: ConnectionContext,
    payload: Extract<ClientSocketMessage, { event: SocketEvents.PLAYER_READY }>["payload"],
  ): Promise<DispatchResult> {
    const { roomId, playerId } = payload;
    this.assertPlayerActionAllowed(context, roomId, playerId, "marcar ready");

    const state = await this.coordinator.setPlayerReady(roomId, playerId);
    const pairingResult = await this.coordinator.tryStartGame(roomId);

    if (!pairingResult) {
      return {
        effects: [this.toRoom(roomId, SocketEvents.GAME_UPDATE, { state })],
      };
    }

    const latestState = (await this.coordinator.getState(roomId)) ?? state;

    return {
      effects: [
        this.toRoom(roomId, SocketEvents.GAME_UPDATE, { state: latestState }),
        this.toRoom(roomId, SocketEvents.GAME_START, {}),
        this.toRoom(roomId, SocketEvents.PAIRS_ASSIGNED, pairingResult),
      ],
    };
  }

  private async handleRollDice(
    context: ConnectionContext,
    payload: Extract<ClientSocketMessage, { event: SocketEvents.ROLL_DICE }>["payload"],
  ): Promise<DispatchResult> {
    const { roomId, playerId } = payload;
    this.assertPlayerActionAllowed(context, roomId, playerId, "lanzar dados");

    const diceResult = await this.coordinator.handleDiceRoll(roomId, playerId);
    const effects: OutboundEffect[] = [
      this.toRoom(roomId, SocketEvents.DICE_ROLLED, diceResult),
    ];

    const state = await this.coordinator.getState(roomId);
    if (state) {
      effects.push(this.toRoom(roomId, SocketEvents.GAME_UPDATE, { state }));

      const roundResults = this.coordinator.getRoundResultsIfComplete(state);
      if (roundResults) {
        roundResults.forEach((roundResult) => {
          effects.push(this.toRoom(roomId, SocketEvents.ROUND_RESULT, roundResult));
        });

        const nextPhase = await this.coordinator.advanceRound(roomId);
        const latestState = await this.coordinator.getState(roomId);

        if (latestState) {
          effects.push(this.toRoom(roomId, SocketEvents.GAME_UPDATE, { state: latestState }));
        }

        if ('pairs' in nextPhase) {
          effects.push(this.toRoom(roomId, SocketEvents.PAIRS_ASSIGNED, nextPhase));
        } else {
          effects.push(this.toRoom(roomId, SocketEvents.GAME_OVER, nextPhase));
        }
      }
    }

    return { effects };
  }

  private async prepareRoomTransition(
    context: ConnectionContext,
    nextRoomId: string,
    nextRole: ConnectionRole,
  ): Promise<OutboundEffect[]> {
    if (!context.roomId) {
      return [];
    }

    if (context.roomId === nextRoomId && context.role === nextRole) {
      return [];
    }

    if (context.role === "observer") {
      this.decrementObserver(context.roomId);
      return [];
    }

    if (!context.playerId) {
      return [];
    }

    const state = await this.coordinator.removePlayer(context.roomId, context.playerId);
    const effects: OutboundEffect[] = [
      this.toRoom(context.roomId, SocketEvents.PLAYER_LEFT, {
        playerId: context.playerId,
      }),
    ];

    if (state) {
      effects.push(this.toRoom(context.roomId, SocketEvents.GAME_UPDATE, { state }));
    }

    return effects;
  }

  private assertPlayerActionAllowed(
    context: ConnectionContext,
    roomId: string,
    playerId: string,
    actionLabel: string,
  ): void {
    if (context.role !== "player") {
      throw new Error(`Solo un jugador puede ${actionLabel}.`);
    }

    if (!context.roomId || !context.playerId) {
      throw new Error("La conexion no esta asociada a un jugador activo.");
    }

    if (context.roomId !== roomId || context.playerId !== playerId) {
      throw new Error("La accion no coincide con la sala o el jugador asociados a esta conexion.");
    }
  }

  private async listRooms(includeFinished: boolean): Promise<RoomSummary[]> {
    const rooms = await this.coordinator.listRooms();

    return rooms
      .filter(({ state }) => includeFinished || state.status !== "finished")
      .map(({ roomId, state }) => this.toRoomSummary(roomId, state))
      .sort((left, right) => left.roomId.localeCompare(right.roomId));
  }

  private toRoomSummary(roomId: string, state: GameState): RoomSummary {
    return {
      roomId,
      sessionId: state.sessionId,
      status: state.status,
      round: state.round,
      maxRounds: state.maxRounds,
      playerCount: state.players.length,
      observerCount: this.observerCounts.get(roomId) ?? 0,
      playerNames: state.players.map((player) => player.name),
    };
  }

  private incrementObserver(roomId: string): void {
    this.observerCounts.set(roomId, (this.observerCounts.get(roomId) ?? 0) + 1);
  }

  private decrementObserver(roomId: string): void {
    const current = this.observerCounts.get(roomId) ?? 0;

    if (current <= 1) {
      this.observerCounts.delete(roomId);
      return;
    }

    this.observerCounts.set(roomId, current - 1);
  }

  private normalizeMaxRounds(maxRounds?: number): number {
    if (!maxRounds || !Number.isFinite(maxRounds)) {
      return 5;
    }

    return Math.max(1, Math.floor(maxRounds));
  }

  private generateRoomId(): string {
    return `room-${Math.random().toString(36).slice(2, 8)}`;
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

import type { Server, Socket } from "socket.io";
import {
  type ClientSocketMessage,
  type ServerSocketMessage,
  SocketEvents,
} from "@dado-triple/shared-types";
import type { GameCoordinator } from "./game-coordinator.js";
import {
  RealtimeEventService,
  type ConnectionContext,
  type DispatchResult,
} from "./realtime-event-service.js";

/**
 * Adaptador temporal de Socket.IO.
 * La lógica de negocio del tiempo real vive en RealtimeEventService para que
 * el equipo pueda reutilizar el mismo contrato desde un servidor WebSocket en Rust.
 */
export class SocketHandler {
  private readonly realtime: RealtimeEventService;

  constructor(
    private io: Server,
    coordinator: GameCoordinator,
  ) {
    this.realtime = new RealtimeEventService(coordinator);
  }

  /** Registra todos los listeners en el servidor de Socket.IO. */
  initialize(): void {
    this.io.on("connection", (socket: Socket) => {
      console.log(`[Socket] Conectado: ${socket.id}`);

      socket.on(SocketEvents.CREATE_ROOM, (payload) =>
        this.onClientMessage(socket, {
          event: SocketEvents.CREATE_ROOM,
          payload,
        } as ClientSocketMessage),
      );

      socket.on(SocketEvents.JOIN_GAME, (payload) =>
        this.onClientMessage(socket, {
          event: SocketEvents.JOIN_GAME,
          payload,
        } as ClientSocketMessage),
      );

      socket.on(SocketEvents.JOIN_AS_OBSERVER, (payload) =>
        this.onClientMessage(socket, {
          event: SocketEvents.JOIN_AS_OBSERVER,
          payload,
        } as ClientSocketMessage),
      );

      socket.on(SocketEvents.LIST_ROOMS, (payload) =>
        this.onClientMessage(socket, {
          event: SocketEvents.LIST_ROOMS,
          payload,
        } as ClientSocketMessage),
      );

      socket.on(SocketEvents.PLAYER_READY, (payload) =>
        this.onClientMessage(socket, {
          event: SocketEvents.PLAYER_READY,
          payload,
        } as ClientSocketMessage),
      );

      socket.on(SocketEvents.ROLL_DICE, (payload) =>
        this.onClientMessage(socket, {
          event: SocketEvents.ROLL_DICE,
          payload,
        } as ClientSocketMessage),
      );

      socket.on("disconnect", () => this.onDisconnect(socket));
    });
  }

  private async onClientMessage(socket: Socket, message: ClientSocketMessage): Promise<void> {
    const context = this.getContext(socket);
    const result = await this.realtime.handleClientMessage(context, message);
    await this.applyDispatchResult(socket, result);
  }

  private async onDisconnect(socket: Socket): Promise<void> {
    console.log(`[Socket] Desconectado: ${socket.id}`);
    const result = await this.realtime.handleDisconnect(this.getContext(socket));
    await this.applyDispatchResult(socket, result);
  }

  private getContext(socket: Socket): ConnectionContext {
    return {
      roomId: socket.data.roomId as string | undefined,
      playerId: socket.data.playerId as string | undefined,
      role: socket.data.role as ConnectionContext["role"],
    };
  }

  private async applyDispatchResult(socket: Socket, result: DispatchResult): Promise<void> {
    const previousRoomId = socket.data.roomId as string | undefined;

    if (result.nextContext) {
      if (previousRoomId && previousRoomId !== result.nextContext.roomId) {
        await socket.leave(previousRoomId);
      }

      socket.data.roomId = result.nextContext.roomId;
      socket.data.playerId = result.nextContext.playerId;
      socket.data.role = result.nextContext.role;

      if (result.nextContext.roomId) {
        await socket.join(result.nextContext.roomId);
      }
    }

    for (const effect of result.effects) {
      if (effect.scope === "self") {
        this.emitToSocket(socket, effect.message);
        continue;
      }

      if (effect.scope === "all") {
        this.io.emit(effect.message.event, effect.message.payload);
        continue;
      }

      this.io.to(effect.roomId).emit(effect.message.event, effect.message.payload);
    }
  }

  private emitToSocket(socket: Socket, message: ServerSocketMessage): void {
    socket.emit(message.event, message.payload);
  }
}

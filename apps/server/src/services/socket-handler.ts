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

      socket.on(SocketEvents.JOIN_GAME, (payload) =>
        this.onClientMessage(socket, {
          event: SocketEvents.JOIN_GAME,
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
    };
  }

  private async applyDispatchResult(socket: Socket, result: DispatchResult): Promise<void> {
    if (result.nextContext?.roomId) {
      socket.data.roomId = result.nextContext.roomId;
      await socket.join(result.nextContext.roomId);
    }

    if (result.nextContext?.playerId) {
      socket.data.playerId = result.nextContext.playerId;
    }

    for (const effect of result.effects) {
      if (effect.scope === "self") {
        this.emitToSocket(socket, effect.message);
        continue;
      }

      this.io.to(effect.roomId).emit(effect.message.event, effect.message.payload);
    }
  }

  private emitToSocket(socket: Socket, message: ServerSocketMessage): void {
    socket.emit(message.event, message.payload);
  }
}

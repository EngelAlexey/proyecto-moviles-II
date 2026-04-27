import { createServer, type Server as HttpServer } from "http";
import { Server as IOServer } from "socket.io";
import { io as Client, type Socket as ClientSocket } from "socket.io-client";
import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from "@jest/globals";
import {
  SocketEvents,
  type GameState,
  type PairsAssignedPayload,
  type RoomCreatedPayload,
  type RoomsListPayload,
} from "@dado-triple/shared-types";
import { GameCoordinator } from "../src/services/game-coordinator.js";
import { RealtimeEventService } from "../src/services/realtime-event-service.js";
import { SocketHandler } from "../src/services/socket-handler.js";

const mockPrisma = {
  gameSessionModel: {
    create: jest.fn(),
    update: jest.fn(),
  },
  playerModel: {
    upsert: jest.fn(),
    update: jest.fn(),
  },
  movementModel: {
    create: jest.fn().mockResolvedValue({}),
  },
};

const mockRedis = {
  saveGameState: jest.fn(),
  getGameState: jest.fn(),
  deleteGameState: jest.fn(),
  listRoomIds: jest.fn(),
};

describe("Socket Integration Flow", () => {
  let io: IOServer;
  let server: HttpServer;
  let handler: SocketHandler;
  let coordinator: GameCoordinator;
  let port: number;
  let stateStore: Map<string, GameState>;

  beforeAll((done) => {
    server = createServer();
    io = new IOServer(server);
    coordinator = new GameCoordinator(mockPrisma as any, mockRedis as any);
    handler = new SocketHandler(io, coordinator);
    handler.initialize();

    server.listen(() => {
      const address = server.address();
      port = typeof address === "object" && address !== null ? address.port : 4001;
      done();
    });
  });

  beforeEach(() => {
    stateStore = new Map<string, GameState>();
    jest.clearAllMocks();

    mockPrisma.gameSessionModel.create.mockImplementation(async () => ({
      id: `session-${stateStore.size + 1}`,
    }));
    mockPrisma.gameSessionModel.update.mockResolvedValue({});
    mockPrisma.playerModel.update.mockResolvedValue({});
    mockPrisma.movementModel.create.mockResolvedValue({});
    mockPrisma.playerModel.upsert.mockImplementation(async ({ where, create }: any) => ({
      id: where.username.toLowerCase(),
      username: create.username,
    }));

    mockRedis.saveGameState.mockImplementation(async (roomId: string, state: GameState) => {
      stateStore.set(roomId, JSON.parse(JSON.stringify(state)));
    });
    mockRedis.getGameState.mockImplementation(async (roomId: string) => {
      return stateStore.get(roomId) ?? null;
    });
    mockRedis.deleteGameState.mockImplementation(async (roomId: string) => {
      stateStore.delete(roomId);
    });
    mockRedis.listRoomIds.mockImplementation(async () => {
      return [...stateStore.keys()];
    });
  });

  afterAll((done) => {
    io.close();
    server.close(done);
  });

  const createClient = (): ClientSocket => Client(`http://localhost:${port}`);

  const waitForEvent = <Payload>(
    client: ClientSocket,
    event: string,
  ): Promise<Payload> =>
    new Promise((resolve) => {
      client.once(event, (payload: Payload) => resolve(payload));
    });

  test("joining different rooms keeps each game state isolated", async () => {
    const realtime = new RealtimeEventService(coordinator);

    await realtime.handleClientMessage(
      {},
      {
        event: SocketEvents.JOIN_GAME,
        payload: { roomId: "room-a", playerName: "Alice" },
      },
    );
    await realtime.handleClientMessage(
      {},
      {
        event: SocketEvents.JOIN_GAME,
        payload: { roomId: "room-b", playerName: "Bob" },
      },
    );

    const roomA = stateStore.get("room-a");
    const roomB = stateStore.get("room-b");

    expect(roomA?.players.map((player) => player.name)).toEqual(["Alice"]);
    expect(roomB?.players.map((player) => player.name)).toEqual(["Bob"]);
  });

  test("dice effects are emitted only to the matching room", async () => {
    const realtime = new RealtimeEventService(coordinator);

    const joinA = await realtime.handleClientMessage(
      {},
      {
        event: SocketEvents.JOIN_GAME,
        payload: { roomId: "room-a", playerName: "Alice" },
      },
    );
    await realtime.handleClientMessage(
      {},
      {
        event: SocketEvents.JOIN_GAME,
        payload: { roomId: "room-a", playerName: "Carol" },
      },
    );
    await realtime.handleClientMessage(
      {},
      {
        event: SocketEvents.JOIN_GAME,
        payload: { roomId: "room-b", playerName: "Bob" },
      },
    );

    const roomAState = stateStore.get("room-a");
    const roomBState = stateStore.get("room-b");
    expect(roomAState).toBeTruthy();
    expect(roomBState).toBeTruthy();
    expect(roomAState?.players).toHaveLength(2);

    roomAState!.status = "playing";
    roomBState!.status = "playing";
    stateStore.set("room-a", roomAState!);
    stateStore.set("room-b", roomBState!);

    const result = await realtime.handleClientMessage(
      joinA.nextContext ?? {},
      {
        event: SocketEvents.ROLL_DICE,
        payload: { roomId: "room-a", playerId: "alice" },
      },
    );

    const roomEffects = result.effects.filter(
      (effect): effect is Extract<typeof result.effects[number], { scope: "room" }> =>
        effect.scope === "room",
    );

    expect(roomEffects.length).toBeGreaterThan(0);
    expect(roomEffects.every((effect) => effect.roomId === "room-a")).toBe(true);
    expect(roomEffects.some((effect) => effect.message.event === SocketEvents.DICE_ROLLED)).toBe(true);
  });

  test("observer can join a room but cannot execute player actions", async () => {
    const player = createClient();
    const observer = createClient();
    const roomId = "room-observer";

    try {
      player.emit(SocketEvents.JOIN_GAME, { roomId, playerName: "Alice" });
      await new Promise((resolve) => setTimeout(resolve, 200));

      const observerState = waitForEvent<{ state: GameState }>(observer, SocketEvents.GAME_UPDATE);
      const observerError = waitForEvent<{ message: string }>(observer, SocketEvents.ERROR);

      observer.emit(SocketEvents.JOIN_AS_OBSERVER, { roomId });
      await observerState;

      observer.emit(SocketEvents.ROLL_DICE, { roomId, playerId: "alice" });

      const error = await observerError;
      expect(error.message).toContain("Solo un jugador");
    } finally {
      player.disconnect();
      observer.disconnect();
    }
  });

  test("create_room and list_rooms expose available rooms", async () => {
    const client = createClient();
    const roomId = "room-visible";

    try {
      const roomCreated = waitForEvent<RoomCreatedPayload>(client, SocketEvents.ROOM_CREATED);
      client.emit(SocketEvents.CREATE_ROOM, { roomId });
      const created = await roomCreated;

      expect(created.room.roomId).toBe(roomId);
      expect(created.state.players).toHaveLength(0);

      const roomsListPromise = waitForEvent<RoomsListPayload>(client, SocketEvents.ROOMS_LIST);
      client.emit(SocketEvents.LIST_ROOMS, { includeFinished: true });
      const roomsList = await roomsListPromise;

      expect(roomsList.rooms.some((room) => room.roomId === roomId)).toBe(true);
    } finally {
      client.disconnect();
    }
  });

  test("create_room broadcasts an updated rooms list to connected observers", async () => {
    const observer = createClient();
    const creator = createClient();
    const roomId = "room-broadcast";

    try {
      const initialRoomsList = waitForEvent<RoomsListPayload>(observer, SocketEvents.ROOMS_LIST);
      observer.emit(SocketEvents.LIST_ROOMS, { includeFinished: true });
      await initialRoomsList;

      const broadcastRoomsList = waitForEvent<RoomsListPayload>(observer, SocketEvents.ROOMS_LIST);
      const roomCreated = waitForEvent<RoomCreatedPayload>(creator, SocketEvents.ROOM_CREATED);

      creator.emit(SocketEvents.CREATE_ROOM, { roomId });

      const [created, roomsList] = await Promise.all([roomCreated, broadcastRoomsList]);

      expect(created.room.roomId).toBe(roomId);
      expect(roomsList.rooms.some((room) => room.roomId === roomId)).toBe(true);
    } finally {
      observer.disconnect();
      creator.disconnect();
    }
  });

  test("the round advances after all active players roll", async () => {
    const realtime = new RealtimeEventService(coordinator);
    const roomId = "room-rounds";

    const aliceJoin = await realtime.handleClientMessage(
      {},
      {
        event: SocketEvents.JOIN_GAME,
        payload: { roomId, playerName: "Alice" },
      },
    );
    const bobJoin = await realtime.handleClientMessage(
      {},
      {
        event: SocketEvents.JOIN_GAME,
        payload: { roomId, playerName: "Bob" },
      },
    );

    await realtime.handleClientMessage(aliceJoin.nextContext ?? {}, {
      event: SocketEvents.PLAYER_READY,
      payload: { roomId, playerId: "alice" },
    });

    await realtime.handleClientMessage(bobJoin.nextContext ?? {}, {
      event: SocketEvents.PLAYER_READY,
      payload: { roomId, playerId: "bob" },
    });

    const firstRoll = await realtime.handleClientMessage(aliceJoin.nextContext ?? {}, {
      event: SocketEvents.ROLL_DICE,
      payload: { roomId, playerId: "alice" },
    });

    expect(firstRoll.effects.some((effect) => effect.message.event === SocketEvents.ROUND_RESULT)).toBe(false);

    const secondRoll = await realtime.handleClientMessage(bobJoin.nextContext ?? {}, {
      event: SocketEvents.ROLL_DICE,
      payload: { roomId, playerId: "bob" },
    });

    expect(secondRoll.effects.some((effect) => effect.message.event === SocketEvents.ROUND_RESULT)).toBe(true);

    const nextRoundPairing = secondRoll.effects.find(
      (effect): effect is Extract<typeof secondRoll.effects[number], { scope: "room" }> =>
        effect.scope === "room" && effect.message.event === SocketEvents.PAIRS_ASSIGNED,
    );

    expect(nextRoundPairing).toBeTruthy();
    expect((nextRoundPairing?.message.payload as PairsAssignedPayload).round).toBe(2);
    expect(stateStore.get(roomId)?.round).toBe(2);
  });
});

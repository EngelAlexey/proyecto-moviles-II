import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import type { GameState } from "@dado-triple/shared-types";
import { GameCoordinator } from "../src/services/game-coordinator.js";

type PrismaMock = {
  gameSessionModel: {
    create: ReturnType<typeof jest.fn>;
    update: ReturnType<typeof jest.fn>;
  };
  playerModel: {
    upsert: ReturnType<typeof jest.fn>;
    update: ReturnType<typeof jest.fn>;
  };
  movementModel: {
    create: ReturnType<typeof jest.fn>;
  };
};

type RedisMock = {
  saveGameState: ReturnType<typeof jest.fn>;
  getGameState: ReturnType<typeof jest.fn>;
  deleteGameState: ReturnType<typeof jest.fn>;
  listRoomIds: ReturnType<typeof jest.fn>;
};

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
};

describe("GameCoordinator", () => {
  let prisma: PrismaMock;
  let redis: RedisMock;
  let stateStore: Map<string, GameState>;
  let coordinator: GameCoordinator;

  beforeEach(() => {
    stateStore = new Map<string, GameState>();

    prisma = {
      gameSessionModel: {
        create: jest.fn().mockResolvedValue({ id: "session-1" }),
        update: jest.fn().mockResolvedValue({}),
      },
      playerModel: {
        upsert: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      movementModel: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    redis = {
      saveGameState: jest.fn(async (roomId: string, state: GameState) => {
        stateStore.set(roomId, JSON.parse(JSON.stringify(state)));
      }),
      getGameState: jest.fn(async (roomId: string) => stateStore.get(roomId) ?? null),
      deleteGameState: jest.fn(async (roomId: string) => {
        stateStore.delete(roomId);
      }),
      listRoomIds: jest.fn(async () => [...stateStore.keys()]),
    };

    coordinator = new GameCoordinator(prisma as any, redis as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("createSession inicializa byePlayerId en null", async () => {
    const state = await coordinator.createSession("room-a");

    expect(state.byePlayerId).toBeNull();
    expect(stateStore.get("room-a")?.byePlayerId).toBeNull();
  });

  test("tryStartGame persiste byePlayerId en el estado guardado", async () => {
    const state: GameState = {
      sessionId: "session-start",
      players: [
        { id: "p1", name: "Ana", score: 0, isReady: true },
        { id: "p2", name: "Beto", score: 0, isReady: true },
        { id: "p3", name: "Carla", score: 0, isReady: true },
      ],
      pairs: [],
      byePlayerId: null,
      currentDice: [0, 0, 0],
      status: "waiting",
      round: 0,
      maxRounds: 5,
    };

    stateStore.set("room-start", JSON.parse(JSON.stringify(state)));

    const result = await coordinator.tryStartGame("room-start");
    const persisted = stateStore.get("room-start");

    expect(result).not.toBeNull();
    expect(persisted?.byePlayerId).toBe(result?.bye ?? null);
    expect(persisted?.round).toBe(1);
    expect(persisted?.status).toBe("playing");
  });

  test("advanceRound actualiza byePlayerId en cada nuevo emparejamiento", async () => {
    const state: GameState = {
      sessionId: "session-round",
      players: [
        { id: "p1", name: "Ana", score: 10, isReady: true },
        { id: "p2", name: "Beto", score: 20, isReady: true },
        { id: "p3", name: "Carla", score: 30, isReady: true },
      ],
      pairs: [],
      byePlayerId: null,
      currentDice: [4, 5, 6],
      status: "playing",
      round: 1,
      maxRounds: 5,
    };

    stateStore.set("room-round", JSON.parse(JSON.stringify(state)));

    const result = await coordinator.advanceRound("room-round");
    const persisted = stateStore.get("room-round");

    expect("winnerId" in result).toBe(false);
    if ("winnerId" in result) {
      throw new Error("No se esperaba game over");
    }

    expect(persisted?.byePlayerId).toBe(result.bye);
    expect(persisted?.round).toBe(2);
  });

  test("removePlayer limpia byePlayerId si el jugador que sale estaba descansando", async () => {
    const state: GameState = {
      sessionId: "session-remove",
      players: [
        { id: "p1", name: "Ana", score: 10, isReady: true },
        { id: "p2", name: "Beto", score: 20, isReady: true },
        { id: "p3", name: "Carla", score: 30, isReady: true },
      ],
      pairs: [{ player1Id: "p1", player2Id: "p2" }],
      byePlayerId: "p3",
      currentDice: [2, 2, 3],
      status: "playing",
      round: 2,
      maxRounds: 5,
    };

    stateStore.set("room-remove", JSON.parse(JSON.stringify(state)));

    const nextState = await coordinator.removePlayer("room-remove", "p3");

    expect(nextState?.byePlayerId).toBeNull();
    expect(nextState?.players).toHaveLength(2);
  });

  test("retryPersistMovement reintenta con backoff exponencial hasta lograr persistencia", async () => {
    jest.useFakeTimers();
    prisma.movementModel.create
      .mockRejectedValueOnce(new Error("mongo down"))
      .mockRejectedValueOnce(new Error("mongo still down"))
      .mockResolvedValueOnce({});

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

    const promise = (coordinator as any).retryPersistMovement(
      {
        sessionId: "session-1",
        playerId: "player-1",
        diceValues: [1, 2, 3],
        comboType: "nada",
        scoreEarned: 6,
      },
      3,
      1000,
    );

    expect(prisma.movementModel.create).toHaveBeenCalledTimes(1);

    await flushMicrotasks();
    await jest.advanceTimersByTimeAsync(1000);
    expect(prisma.movementModel.create).toHaveBeenCalledTimes(2);

    await flushMicrotasks();
    await jest.advanceTimersByTimeAsync(2000);
    await promise;

    expect(prisma.movementModel.create).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test("retryPersistMovement descarta la carga tras el ultimo intento fallido", async () => {
    jest.useFakeTimers();
    prisma.movementModel.create.mockRejectedValue(new Error("mongo unavailable"));

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

    const promise = (coordinator as any).retryPersistMovement(
      {
        sessionId: "session-2",
        playerId: "player-2",
        diceValues: [6, 6, 6],
        comboType: "triple",
        scoreEarned: 118,
      },
      3,
      1000,
    );

    await flushMicrotasks();
    await jest.advanceTimersByTimeAsync(1000);
    await flushMicrotasks();
    await jest.advanceTimersByTimeAsync(2000);
    await promise;

    expect(prisma.movementModel.create).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledTimes(3);
    expect(errorSpy).toHaveBeenCalledWith(
      "[GameCoordinator] Carga descartada tras 3 intentos fallidos - MongoDB no responde.",
    );
  });
});

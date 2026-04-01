import { io as Client, type Socket as ClientSocket } from "socket.io-client";
import { Server as IOServer } from "socket.io";
import { createServer, Server as HttpServer } from "http";
import { SocketHandler } from "../src/services/socket-handler.js";
import { GameCoordinator } from "../src/services/game-coordinator.js";
import { SocketEvents, type DiceRolledPayload } from "@dado-triple/shared-types";

// Mocking dependencies
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
};

// Mock the PrismaService module
jest.mock("../prisma/PrismaService.js", () => ({
  getPrismaClient: () => mockPrisma,
  disconnectPrisma: jest.fn(),
}));

// Mock the RedisService module
jest.mock("../src/services/redis.service.js", () => ({
  RedisService: jest.fn().mockImplementation(() => {
    return mockRedis;
  }),
}));

describe("Socket Integration Flow", () => {
  let io: IOServer;
  let server: HttpServer;
  let handler: SocketHandler;
  let coordinator: GameCoordinator;
  let port: number;

  beforeAll((done) => {
    server = createServer();
    io = new IOServer(server);
    coordinator = new GameCoordinator(mockPrisma as any, mockRedis as any);
    handler = new SocketHandler(io, coordinator);
    handler.initialize();

    server.listen(() => {
      const address = server.address();
      if (typeof address === 'object' && address !== null) {
        port = address.port;
      } else {
        port = 4001; // Fallback
      }
      done();
    });
  });

  afterAll((done) => {
    io.close();
    server.close(done);
  });

  const createClient = (): ClientSocket => {
    return Client(`http://localhost:${port}`);
  };

  test("two clients join and roll dice", (done) => {
    const client1 = createClient();
    const client2 = createClient();
    const roomId = "test-room";
    let diceRolledCount = 0;

    // Reset mocks for this test
    mockPrisma.gameSessionModel.create.mockResolvedValue({ id: "session-123" });
    mockPrisma.gameSessionModel.update.mockResolvedValue({});
    mockRedis.getGameState.mockResolvedValue(null); 

    // Mock players returning different IDs
    mockPrisma.playerModel.upsert
      .mockResolvedValueOnce({ id: "p1", username: "Alice" })
      .mockResolvedValueOnce({ id: "p2", username: "Bob" });

    // Implementation to capture the state save
    let capturedState: any = null;
    mockRedis.saveGameState.mockImplementation((id, state) => {
      capturedState = state;
      mockRedis.getGameState.mockResolvedValue(state);
      return Promise.resolve();
    });

    const cleanup = () => {
      client1.disconnect();
      client2.disconnect();
    };

    client1.on(SocketEvents.DICE_ROLLED, (data: DiceRolledPayload) => {
      console.log('Client 1 received DICE_ROLLED');
      expect(data.score).toBeGreaterThanOrEqual(0);
      diceRolledCount++;
      if (diceRolledCount === 2) {
        cleanup();
        done();
      }
    });

    client2.on(SocketEvents.DICE_ROLLED, (data: DiceRolledPayload) => {
      console.log('Client 2 received DICE_ROLLED');
      expect(data.score).toBeGreaterThanOrEqual(0);
      diceRolledCount++;
      if (diceRolledCount === 2) {
        cleanup();
        done();
      }
    });

    // Alice joins
    client1.emit(SocketEvents.JOIN_GAME, { roomId, playerName: "Alice" });
    
    // Bob joins after Alice is added (simulated delay)
    setTimeout(() => {
      client2.emit(SocketEvents.JOIN_GAME, { roomId, playerName: "Bob" });
    }, 50);

    // After both are joined, Alice rolls dice
    setTimeout(() => {
      // Force status to playing in the mock state to allow rolling
      if (capturedState) {
        capturedState.status = "playing";
      }
      
      client1.emit(SocketEvents.ROLL_DICE, { roomId, playerId: "p1" });
      client2.emit(SocketEvents.ROLL_DICE, { roomId, playerId: "p2" });
    }, 300);

  }, 15000);
});

// ─── Dados ───────────────────────────────────────────────────────────────────

/** Tupla que representa el resultado de lanzar tres dados (1-6 cada uno). */
export type DiceValues = [number, number, number];

/** Tipo de combinación obtenida en un lanzamiento. */
export type DiceCombo = "triple" | "par" | "nada";

// ─── Jugador ─────────────────────────────────────────────────────────────────

export interface Player {
  id: string;
  name: string;
  score: number;
  isReady: boolean;
}

// ─── Emparejamiento ──────────────────────────────────────────────────────────

/** Una pareja de jugadores que se enfrentan en una ronda. */
export interface Pair {
  player1Id: string;
  player2Id: string;
}

/**
 * Resultado de la función de emparejamiento.
 * Si el número de jugadores es impar, `bye` contiene el id del jugador
 * que descansa esa ronda (avanza automáticamente).
 */
export interface PairingResult {
  pairs: Pair[];
  bye: string | null;
}

// ─── Estado del juego ────────────────────────────────────────────────────────

export type GameStatus = "waiting" | "pairing" | "playing" | "finished";

export interface GameState {
  sessionId: string;
  players: Player[];
  pairs: Pair[];
  byePlayerId?: string | null;
  currentDice: DiceValues;
  status: GameStatus;
  round: number;
  maxRounds: number;
}

export type ConnectionRole = "player" | "observer";

export interface RoomSummary {
  roomId: string;
  sessionId: string;
  status: GameStatus;
  round: number;
  maxRounds: number;
  playerCount: number;
  observerCount: number;
  playerNames: string[];
}

// ─── Sesión persistida ───────────────────────────────────────────────────────

export interface IGameSession {
  sessionId: string;
  players: string[];
  finalScores: Record<string, number>;
  createdAt: Date;
}

// ─── WebSocket Events ────────────────────────────────────────────────────────

export enum SocketEvents {
  // Cliente → Servidor
  CREATE_ROOM = "create_room",
  JOIN_GAME = "join_game",
  JOIN_AS_OBSERVER = "join_as_observer",
  LIST_ROOMS = "list_rooms",
  PLAYER_READY = "player_ready",
  ROLL_DICE = "roll_dice",

  // Servidor → Cliente
  ROOM_CREATED = "room_created",
  ROOMS_LIST = "rooms_list",
  PLAYER_JOINED = "player_joined",
  PLAYER_LEFT = "player_left",
  GAME_START = "game_start",
  PAIRS_ASSIGNED = "pairs_assigned",
  DICE_ROLLED = "dice_rolled",
  ROUND_RESULT = "round_result",
  GAME_UPDATE = "game_update",
  GAME_OVER = "game_over",
  ERROR = "error",
}

export const CLIENT_SOCKET_EVENTS = [
  SocketEvents.CREATE_ROOM,
  SocketEvents.JOIN_GAME,
  SocketEvents.JOIN_AS_OBSERVER,
  SocketEvents.LIST_ROOMS,
  SocketEvents.PLAYER_READY,
  SocketEvents.ROLL_DICE,
] as const;

export const SERVER_SOCKET_EVENTS = [
  SocketEvents.ROOM_CREATED,
  SocketEvents.ROOMS_LIST,
  SocketEvents.PLAYER_JOINED,
  SocketEvents.PLAYER_LEFT,
  SocketEvents.GAME_START,
  SocketEvents.PAIRS_ASSIGNED,
  SocketEvents.DICE_ROLLED,
  SocketEvents.ROUND_RESULT,
  SocketEvents.GAME_UPDATE,
  SocketEvents.GAME_OVER,
  SocketEvents.ERROR,
] as const;

export type RealtimeTransport = "socket.io" | "websocket";

// ─── Payloads de eventos ─────────────────────────────────────────────────────

/** Cliente envía al unirse. */
export interface JoinGamePayload {
  playerName: string;
}

export interface CreateRoomPayload {
  roomId?: string;
  maxRounds?: number;
}

export interface JoinAsObserverPayload {
  roomId: string;
}

export interface ListRoomsPayload {
  includeFinished?: boolean;
}

export interface RoomCreatedPayload {
  room: RoomSummary;
  state: GameState;
}

export interface RoomsListPayload {
  rooms: RoomSummary[];
}

/** Servidor notifica que un jugador se unió. */
export interface PlayerJoinedPayload {
  player: Player;
  totalPlayers: number;
}

/** Servidor notifica las parejas asignadas para la ronda. */
export interface PairsAssignedPayload {
  pairs: Pair[];
  bye: string | null;
  round: number;
}

/** Servidor notifica resultado de un lanzamiento. */
export interface DiceRolledPayload {
  playerId: string;
  dice: DiceValues;
  combo: DiceCombo;
  score: number;
}

/** Resultado de una ronda entre dos jugadores. */
export interface RoundResultPayload {
  pair: Pair;
  scores: { player1: number; player2: number };
  winnerId: string | null; // null = empate
}

/** Servidor envía el estado actualizado. */
export interface GameUpdatePayload {
  state: GameState;
}

/** Servidor notifica el fin de la partida. */
export interface GameOverPayload {
  finalScores: Record<string, number>;
  winnerId: string;
}

/** Servidor notifica un error. */
export interface ErrorPayload {
  message: string;
  code?: string;
}

export interface ClientSocketEventMap {
  [SocketEvents.CREATE_ROOM]: CreateRoomPayload;
  [SocketEvents.JOIN_GAME]: JoinGamePayload & { roomId: string };
  [SocketEvents.JOIN_AS_OBSERVER]: JoinAsObserverPayload;
  [SocketEvents.LIST_ROOMS]: ListRoomsPayload;
  [SocketEvents.PLAYER_READY]: { roomId: string; playerId: string };
  [SocketEvents.ROLL_DICE]: { roomId: string; playerId: string };
}

export interface ServerSocketEventMap {
  [SocketEvents.ROOM_CREATED]: RoomCreatedPayload;
  [SocketEvents.ROOMS_LIST]: RoomsListPayload;
  [SocketEvents.PLAYER_JOINED]: PlayerJoinedPayload;
  [SocketEvents.PLAYER_LEFT]: { playerId: string };
  [SocketEvents.GAME_START]: Record<string, never>;
  [SocketEvents.PAIRS_ASSIGNED]: PairsAssignedPayload;
  [SocketEvents.DICE_ROLLED]: DiceRolledPayload;
  [SocketEvents.ROUND_RESULT]: RoundResultPayload;
  [SocketEvents.GAME_UPDATE]: GameUpdatePayload;
  [SocketEvents.GAME_OVER]: GameOverPayload;
  [SocketEvents.ERROR]: ErrorPayload;
}

export type ClientSocketEvent = keyof ClientSocketEventMap;
export type ServerSocketEvent = keyof ServerSocketEventMap;

type SocketMessageFor<EventMap, Event extends keyof EventMap> = {
  event: Event;
  payload: EventMap[Event];
};

export type ClientSocketMessage = {
  [Event in keyof ClientSocketEventMap]: SocketMessageFor<ClientSocketEventMap, Event>;
}[keyof ClientSocketEventMap];

export type ServerSocketMessage = {
  [Event in keyof ServerSocketEventMap]: SocketMessageFor<ServerSocketEventMap, Event>;
}[keyof ServerSocketEventMap];

export type SocketMessage = ClientSocketMessage | ServerSocketMessage;

export function serializeSocketMessage(message: SocketMessage): string {
  return JSON.stringify(message);
}

export function parseSocketMessage(raw: string): SocketMessage | null {
  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!isSocketMessage(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function isSocketMessage(value: unknown): value is SocketMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.event === "string" &&
    Object.values(SocketEvents).includes(candidate.event as SocketEvents) &&
    "payload" in candidate
  );
}

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
  currentDice: DiceValues;
  status: GameStatus;
  round: number;
  maxRounds: number;
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
  JOIN_GAME = "join_game",
  PLAYER_READY = "player_ready",
  ROLL_DICE = "roll_dice",

  // Servidor → Cliente
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

// ─── Payloads de eventos ─────────────────────────────────────────────────────

/** Cliente envía al unirse. */
export interface JoinGamePayload {
  playerName: string;
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

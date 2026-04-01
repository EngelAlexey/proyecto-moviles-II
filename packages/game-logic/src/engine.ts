import type {
  DiceValues,
  DiceCombo,
  Pair,
  PairingResult,
} from "@dado-triple/shared-types";

// ─── Constantes ──────────────────────────────────────────────────────────────

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
const TRIPLE_BONUS = 100;
const PAIR_BONUS = 50;

// ─── Dados ───────────────────────────────────────────────────────────────────

/** Lanza tres dados (valores 1-6). */
export function rollDice(): DiceValues {
  return [
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
  ];
}

/** Determina el tipo de combinación de un lanzamiento. */
export function getDiceCombo(dice: DiceValues): DiceCombo {
  const [d1, d2, d3] = dice;
  if (d1 === d2 && d2 === d3) return "triple";
  if (d1 === d2 || d1 === d3 || d2 === d3) return "par";
  return "nada";
}

/**
 * Calcula el puntaje de un lanzamiento de tres dados.
 * - Triple: suma + 100
 * - Par:    suma + 50
 * - Nada:   suma
 */
export function calculateScore(dice: DiceValues): number {
  const sum = dice[0] + dice[1] + dice[2];
  const combo = getDiceCombo(dice);
  if (combo === "triple") return sum + TRIPLE_BONUS;
  if (combo === "par") return sum + PAIR_BONUS;
  return sum;
}

// ─── Emparejamiento ──────────────────────────────────────────────────────────

/**
 * Mezcla un arreglo in-place usando Fisher-Yates.
 * Acepta un generador de random opcional para facilitar testing.
 */
export function shuffle<T>(
  array: T[],
  randomFn: () => number = Math.random,
): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Agrupa entre 5 y 10 jugadores en parejas de forma aleatoria.
 *
 * - Lanza error si hay menos de 5 o más de 10 jugadores.
 * - Si el número de jugadores es impar, uno queda en "bye" (descansa la ronda).
 *
 * @param playerIds - Lista de identificadores de jugadores.
 * @param randomFn  - Generador de random inyectable para tests deterministas.
 */
export function pairPlayers(
  playerIds: string[],
  randomFn: () => number = Math.random,
): PairingResult {
  if (playerIds.length < MIN_PLAYERS) {
    throw new Error(
      `Se necesitan al menos ${MIN_PLAYERS} jugadores, pero se recibieron ${playerIds.length}.`,
    );
  }
  if (playerIds.length > MAX_PLAYERS) {
    throw new Error(
      `Se permiten máximo ${MAX_PLAYERS} jugadores, pero se recibieron ${playerIds.length}.`,
    );
  }

  const shuffled = shuffle(playerIds, randomFn);

  let bye: string | null = null;
  const toPair = [...shuffled];

  if (toPair.length % 2 !== 0) {
    bye = toPair.pop()!;
  }

  const pairs: Pair[] = [];
  for (let i = 0; i < toPair.length; i += 2) {
    pairs.push({ player1Id: toPair[i], player2Id: toPair[i + 1] });
  }

  return { pairs, bye };
}

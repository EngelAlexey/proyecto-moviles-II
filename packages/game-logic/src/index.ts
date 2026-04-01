import type { DiceValues } from "@dado-triple/shared-types";
import {
  rollDice,
  calculateScore,
  getDiceCombo,
  pairPlayers,
  shuffle,
  MIN_PLAYERS,
  MAX_PLAYERS,
} from "./engine";

export {
  rollDice,
  calculateScore,
  getDiceCombo,
  pairPlayers,
  shuffle,
  MIN_PLAYERS,
  MAX_PLAYERS,
};

/**
 * Clase legacy que expone los métodos como estáticos.
 * Preferir las funciones exportadas individualmente.
 */
export class GameEngine {
  static calculateScore(dice: DiceValues): number {
    return calculateScore(dice);
  }

  static rollDice(): DiceValues {
    return rollDice();
  }
}

import { GameEngine } from './index';

describe('GameEngine (clase legacy)', () => {
  test('debe calcular correctamente el puntaje de un trío', () => {
    const score = GameEngine.calculateScore([5, 5, 5]);
    expect(score).toBe(115); // (5+5+5) + 100
  });

  test('debe calcular correctamente el puntaje de un par', () => {
    const score = GameEngine.calculateScore([1, 1, 3]);
    expect(score).toBe(55); // (1+1+3) + 50
  });

  test('debe calcular correctamente el puntaje de dados diferentes', () => {
    const score = GameEngine.calculateScore([1, 2, 3]);
    expect(score).toBe(6); // 1+2+3
  });

  test('rollDice devuelve 3 dados válidos', () => {
    const dice = GameEngine.rollDice();
    expect(dice).toHaveLength(3);
    dice.forEach((d) => {
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(6);
    });
  });
});

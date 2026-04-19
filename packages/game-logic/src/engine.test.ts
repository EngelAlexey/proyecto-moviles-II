import {
  rollDice,
  calculateScore,
  getDiceCombo,
  pairPlayers,
  shuffle,
  MIN_PLAYERS,
  MAX_PLAYERS,
} from "./engine";

// ─── Dados ───────────────────────────────────────────────────────────────────

describe("rollDice", () => {
  test("devuelve exactamente 3 valores", () => {
    const dice = rollDice();
    expect(dice).toHaveLength(3);
  });

  test("cada dado está entre 1 y 6", () => {
    for (let i = 0; i < 100; i++) {
      const dice = rollDice();
      dice.forEach((d) => {
        expect(d).toBeGreaterThanOrEqual(1);
        expect(d).toBeLessThanOrEqual(6);
      });
    }
  });

  test("genera valores variados (no siempre el mismo resultado)", () => {
    const results = new Set<string>();
    for (let i = 0; i < 50; i++) {
      results.add(rollDice().join(","));
    }
    expect(results.size).toBeGreaterThan(1);
  });
});

describe("getDiceCombo", () => {
  test("detecta un triple", () => {
    expect(getDiceCombo([3, 3, 3])).toBe("triple");
    expect(getDiceCombo([6, 6, 6])).toBe("triple");
  });

  test("detecta un par", () => {
    expect(getDiceCombo([1, 1, 4])).toBe("par");
    expect(getDiceCombo([2, 5, 2])).toBe("par");
    expect(getDiceCombo([3, 6, 6])).toBe("par");
  });

  test("detecta cuando no hay combinación", () => {
    expect(getDiceCombo([1, 2, 3])).toBe("nada");
    expect(getDiceCombo([4, 5, 6])).toBe("nada");
  });
});

describe("calculateScore", () => {
  test("triple: suma + 100", () => {
    expect(calculateScore([5, 5, 5])).toBe(115);
    expect(calculateScore([1, 1, 1])).toBe(103);
  });

  test("par: suma + 50", () => {
    expect(calculateScore([1, 1, 3])).toBe(55);
    expect(calculateScore([4, 6, 4])).toBe(64);
  });

  test("sin combinación: solo la suma", () => {
    expect(calculateScore([1, 2, 3])).toBe(6);
    expect(calculateScore([4, 5, 6])).toBe(15);
  });

  test("puntaje mínimo posible (1,2,3) = 6", () => {
    expect(calculateScore([1, 2, 3])).toBe(6);
  });

  test("puntaje máximo posible (6,6,6) = 118", () => {
    expect(calculateScore([6, 6, 6])).toBe(118);
  });
});

// ─── Emparejamiento ──────────────────────────────────────────────────────────

describe("shuffle", () => {
  test("retorna un arreglo de la misma longitud", () => {
    const input = [1, 2, 3, 4, 5];
    expect(shuffle(input)).toHaveLength(input.length);
  });

  test("contiene los mismos elementos", () => {
    const input = ["a", "b", "c", "d", "e"];
    expect(shuffle(input).sort()).toEqual([...input].sort());
  });

  test("no muta el arreglo original", () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    shuffle(input);
    expect(input).toEqual(copy);
  });

  test("respeta la función de random inyectada", () => {
    let call = 0;
    // Random determinista que siempre devuelve 0 → no intercambia
    const result = shuffle([1, 2, 3, 4, 5], () => {
      call++;
      return 0;
    });
    expect(call).toBeGreaterThan(0);
    // Con random=0, j siempre es 0, así que el primer elemento se mueve al final
    expect(result).toHaveLength(5);
  });
});

describe("pairPlayers", () => {
  const makeIds = (n: number) =>
    Array.from({ length: n }, (_, i) => `p${i + 1}`);

  // ── Validación de rango ────────────────────────────────────────────────

  test("lanza error con menos de 2 jugadores", () => {
    expect(() => pairPlayers(makeIds(1))).toThrow(/al menos 2/);
  });

  test("lanza error con más de 10 jugadores", () => {
    expect(() => pairPlayers(makeIds(11))).toThrow(/máximo 10/);
    expect(() => pairPlayers(makeIds(15))).toThrow(/máximo 10/);
  });

  // ── Número par de jugadores ────────────────────────────────────────────

  test.each([2, 4, 6, 8, 10])(
    "con %i jugadores (par) no hay bye y las parejas cubren a todos",
    (n) => {
      const ids = makeIds(n);
      const { pairs, bye } = pairPlayers(ids);

      expect(bye).toBeNull();
      expect(pairs).toHaveLength(n / 2);

      const allInPairs = pairs.flatMap((p) => [p.player1Id, p.player2Id]);
      expect(allInPairs.sort()).toEqual([...ids].sort());
    },
  );

  // ── Número impar de jugadores ──────────────────────────────────────────

  test.each([3, 5, 7, 9])(
    "con %i jugadores (impar) hay exactamente un bye",
    (n) => {
      const ids = makeIds(n);
      const { pairs, bye } = pairPlayers(ids);

      expect(bye).not.toBeNull();
      expect(ids).toContain(bye);
      expect(pairs).toHaveLength((n - 1) / 2);

      const allInPairs = pairs.flatMap((p) => [p.player1Id, p.player2Id]);
      expect(allInPairs).not.toContain(bye);

      const everyone = [...allInPairs, bye!];
      expect(everyone.sort()).toEqual([...ids].sort());
    },
  );

  // ── Aleatoriedad ───────────────────────────────────────────────────────

  test("las parejas varían entre ejecuciones", () => {
    const ids = makeIds(6);
    const results = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const { pairs } = pairPlayers(ids);
      const key = pairs.map((p) => `${p.player1Id}-${p.player2Id}`).join("|");
      results.add(key);
    }
    expect(results.size).toBeGreaterThan(1);
  });

  test("un jugador no se empareja consigo mismo", () => {
    const ids = makeIds(10);
    for (let i = 0; i < 50; i++) {
      const { pairs } = pairPlayers(ids);
      pairs.forEach((p) => {
        expect(p.player1Id).not.toBe(p.player2Id);
      });
    }
  });

  // ── Determinismo con random inyectado ──────────────────────────────────

  test("produce el mismo resultado con la misma función random", () => {
    const ids = makeIds(8);
    const fixedRandom = () => 0.5;
    const result1 = pairPlayers(ids, fixedRandom);
    const result2 = pairPlayers(ids, fixedRandom);
    expect(result1).toEqual(result2);
  });
});

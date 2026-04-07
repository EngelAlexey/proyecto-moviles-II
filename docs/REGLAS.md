# 🎲 Reglas del Juego - Dado Triple

Este documento define la lógica de puntajes, emparejamientos y condiciones de victoria del sistema Dado Triple.

## Motor de Juego (`packages/game-logic`)
Toda la lógica pura está desacoplada del servidor en su propio paquete para facilitar el testing unitario.

### 1. Jugadores y Salas
- **Capacidad:** El sistema soporta salas de 2 a 10 jugadores.
- **Configuración:** `MIN_PLAYERS: 2` (ajustado para desarrollo y pruebas rápidas, 5 para producción).
- **Estado Inicial:** Un jugador se une y marca `isReady: true`. La partida solo comienza cuando TODOS los jugadores están listos.

### 2. Emparejamiento (Pairing)
Al iniciar cada ronda, el algoritmo:
1. Mezcla aleatoriamente la lista de jugadores.
2. Los agrupa en parejas (enfrentamientos 1 vs 1).
3. **Bye Logic:** Si el número de jugadores es impar, el último jugador queda en "descanso" (`bye`) y avanza a la siguiente ronda sin lanzar.

### 3. Sistema de Puntuación
Cada jugador lanza **3 dados** (valores 1-6). Los puntos se calculan según la combinación:

| Combinación | Requisito | Cálculo de Puntos |
| :--- | :--- | :--- |
| **Trío** | 3 dados iguales | Suma de los dados + **100 bonos** |
| **Par** | 2 dados iguales | Suma de los dados + **50 bonos** |
| **Nada** | Todos diferentes | Suma simple de los dados |

> [!TIP]
> **Ejemplo:**
> - [5, 5, 5]: 15 + 100 = 115 puntos.
> - [4, 4, 1]: 9 + 50 = 59 puntos.
> - [1, 2, 3]: 6 puntos.

### 4. Ciclo de Vida de la Partida
1. **Unirse:** Los jugadores ingresan a la sala mediante el canal de tiempo real configurado (`socket.io` legado o `websocket`).
2. **Listo:** Todos confirman su preparación.
3. **Playing:** El estado cambia y se generan las parejas.
4. **Lanzar:** Cada jugador presiona el botón y el servidor calcula su puntaje.
5. **Round Result:** Se comparan los puntajes de cada pareja y se muestra el ganador del duelo.
6. **Game Over:** Tras alcanzar la ronda máxima (default: 5), el jugador con mayor puntaje total acumulado es el ganador.

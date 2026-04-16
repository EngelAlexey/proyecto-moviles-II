# Reglas Del Juego

## Jugadores y salas

- cada partida vive en una sala
- una sala soporta de 2 a 10 jugadores
- `mobile` participa como jugador
- `web` observa la sala

## Inicio de partida

1. Los jugadores se unen con `join_game`
2. Todos marcan `player_ready`
3. Cuando todos estan listos, la partida pasa a `playing`
4. Se generan parejas para la ronda

## Emparejamiento

- los jugadores se agrupan en parejas 1 vs 1
- si hay un numero impar, un jugador recibe `bye`

## Puntuacion

- trio: suma de dados + 100
- par: suma de dados + 50
- nada: suma simple

## Ciclo de juego

1. `create_room` o `join_game`
2. `player_ready`
3. `pairs_assigned`
4. `roll_dice`
5. `game_update`
6. `game_over`

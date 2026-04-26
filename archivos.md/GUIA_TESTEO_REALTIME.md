# Guia de Testeo Realtime

Estado validado local y remoto el 2026-04-15.

## Endpoint actual

- WebSocket AWS: `ws://3.142.78.130:5000`
- Fallback Socket.IO historico: `http://3.142.78.130:4000`
- Si la IP publica cambia otra vez, actualiza `apps/web/.env` y `apps/mobile/.env`

## Roles esperados

- `mobile` juega como `player`
- `web` observa como `observer`
- La web puede crear sala solo de forma temporal para QA

## Configuracion recomendada

### Web

Archivo: `apps/web/.env`

```env
NEXT_PUBLIC_REALTIME_TRANSPORT=websocket
NEXT_PUBLIC_REALTIME_URL=ws://3.142.78.130:5000
```

### Mobile

Archivo: `apps/mobile/.env`

```env
EXPO_PUBLIC_REALTIME_TRANSPORT=websocket
EXPO_PUBLIC_REALTIME_URL=ws://3.142.78.130:5000
```

## Flujo minimo para probar

1. Levantar el servidor Rust en EC2 con `cargo run`.
2. Confirmar que escucha en puerto `5000`.
3. Abrir la web con `pnpm --filter @dado-triple/web dev`.
4. Entrar a `http://localhost:3000`.
5. Verificar que aparezca `SOCKET: CONECTADO`.
6. Crear una sala desde la web con `CREAR SALA (PRUEBA)` o desde mobile.
7. Unir dos jugadores desde mobile a la misma sala.
8. Marcar `Estoy listo` en ambos jugadores.
9. Lanzar dados desde un jugador.
10. Verificar en web los eventos `ROOMS_LIST`, `ROOM_CREATED`, `PLAYER_JOINED`, `GAME_START`, `PAIRS_ASSIGNED`, `DICE_ROLLED` y `GAME_UPDATE`.

## Pruebas tecnicas que ya pasaron

- `pnpm --filter @dado-triple/server exec tsc --noEmit --pretty false`
- `pnpm --filter @dado-triple/mobile exec tsc --noEmit --pretty false`
- `pnpm --filter @dado-triple/web exec tsc --noEmit --pretty false`
- `pnpm --filter @dado-triple/server test -- socket-flow.test.ts`
- `pnpm --filter @dado-triple/web test -- visitor-view.spec.ts`

Ademas, se valido contra el backend remoto real:

- `create_room`
- `list_rooms`
- `join_as_observer`
- `join_game`
- `player_ready`
- `roll_dice`
- flujo real con `4` jugadores simultaneos y `2` parejas en la ronda 1

## Cosas que no debe cambiar tu companero

- No hardcodear otro IP distinto sin actualizar los `.env`.
- No cambiar el formato de mensajes `{ "event": "...", "payload": {} }`.
- No hacer que la web juegue como jugador en la entrega final.
- No borrar el soporte multisala ni los roles `player` y `observer`.

## Riesgo conocido

Si la web se despliega bajo `https://`, luego habra que mover el socket a `wss://` con TLS o proxy reverso. Para pruebas locales con `http://localhost:3000`, `ws://3.142.78.130:5000` funciona bien.

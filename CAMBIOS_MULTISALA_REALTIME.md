# Cambios Realizados: Soporte Multi-Sala y Roles en Realtime

## Estado General

Se implementó en el repositorio el soporte para múltiples salas independientes en el sistema realtime, eliminando la dependencia de una sala fija compartida.

El comportamiento ahora queda separado así:

- `mobile` juega como `player`
- `web` observa como `observer`

## Confirmación Honesta del Estado

### Lo que sí está hecho y verificado en este repositorio

- El contrato de eventos compartidos ya soporta:
  - crear sala
  - listar salas
  - unirse como jugador
  - unirse como observador
- El backend de `apps/server` ya soporta:
  - estado por sala
  - contexto por conexión con `roomId`, `playerId` y `role`
  - validación para bloquear acciones de juego desde observadores
  - broadcasts aislados por sala
- La app `mobile` ya quedó ajustada para:
  - crear salas
  - unirse a salas como jugador
  - jugar dentro de la sala
- La app `web` ya quedó ajustada para:
  - listar salas
  - entrar como observador
  - ver estado y eventos en tiempo real
  - no ejecutar acciones de jugador
- El código compiló correctamente.
- Las pruebas backend y web que ajusté pasaron.

### Lo que NO puedo confirmar como “ya está arriba y funcionando”

No puedo confirmar que producción/AWS ya esté actualizado con estos cambios, porque desde este workspace no hice un despliegue del servidor remoto ni tengo evidencia de que el backend desplegado en AWS ya hable este contrato nuevo.

Esto es importante:

- En el repo, la lógica backend ajustada vive en `apps/server`.
- Pero durante el debug previo vimos que el socket real en AWS estaba corriendo en un servidor Rust externo al repo.

Entonces:

- `local/repo`: sí, el cambio ya está implementado y validado
- `AWS/producción`: no puedo afirmar que ya esté desplegado solo con este trabajo

Si el servidor activo en AWS sigue siendo el binario Rust externo, hay que replicar allí este mismo contrato de eventos y de salas para que mobile y web funcionen contra ese backend real.

## Cambios Funcionales Implementados

### 1. Se eliminó la dependencia de una sala global fija

Antes:

- el flujo de cliente estaba orientado a reutilizar una sala fija tipo `debug-room`

Ahora:

- las salas usan `roomId` dinámico
- cada partida vive en su propia sala
- los eventos de una sala no afectan otra

### 2. Se agregó soporte explícito de roles por conexión

Cada conexión ahora puede quedar asociada a:

- `roomId`
- `playerId`
- `role`

Roles soportados:

- `player`
- `observer`

### 3. Mobile quedó como cliente jugador

Desde `mobile` ahora se puede:

- crear una sala nueva
- unirse a una sala existente
- recibir estado realtime
- marcar `ready`
- lanzar dados

### 4. Web quedó como cliente observador

Desde `web` ahora se puede:

- listar salas disponibles
- entrar a una sala existente como observador
- ver el estado de la partida en tiempo real
- ver eventos del juego

Temporalmente, para pruebas de integración mientras no esté disponible la app mobile:

- la web también puede crear una sala
- al crearla, la web entra automáticamente como observador de esa misma sala
- este comportamiento está marcado en código como temporal y debe retirarse antes de la entrega final

Desde `web` ya no se puede:

- lanzar dados
- marcar ready
- jugar como participante

### 5. Se agregó soporte de listado de salas

El backend ahora puede devolver un listado de salas activas con un resumen por sala:

- `roomId`
- `sessionId`
- `status`
- `round`
- `maxRounds`
- `playerCount`
- `observerCount`
- `playerNames`

## Contrato de Eventos Nuevo

Se mantuvo la estructura JSON actual:

```json
{
  "event": "nombre_del_evento",
  "payload": {}
}
```

### Nuevos eventos cliente -> servidor

- `create_room`
- `join_game`
- `join_as_observer`
- `list_rooms`
- `player_ready`
- `roll_dice`

### Nuevos eventos servidor -> cliente

- `room_created`
- `rooms_list`
- `player_joined`
- `player_left`
- `game_start`
- `pairs_assigned`
- `dice_rolled`
- `round_result`
- `game_update`
- `game_over`
- `error`

## Archivos Modificados

### Contrato compartido

- `packages/shared-types/src/index.ts`

Qué se hizo:

- se agregaron `ConnectionRole` y `RoomSummary`
- se agregaron nuevos eventos:
  - `CREATE_ROOM`
  - `JOIN_AS_OBSERVER`
  - `LIST_ROOMS`
  - `ROOM_CREATED`
  - `ROOMS_LIST`
- se extendieron los mapas de payloads del realtime

### Backend realtime

- `apps/server/src/services/realtime-event-service.ts`

Qué se hizo:

- se reestructuró la lógica realtime para manejar:
  - creación de salas
  - unión como jugador
  - unión como observador
  - listado de salas
  - validación de acciones según rol
- se guarda y usa contexto por conexión:
  - `roomId`
  - `playerId`
  - `role`
- se bloquea explícitamente que un observador haga acciones de jugador
- se emiten broadcasts solo a la sala correspondiente
- se maneja desconexión de jugadores y observadores de forma distinta

- `apps/server/src/services/socket-handler.ts`

Qué se hizo:

- se conectaron los nuevos eventos de Socket.IO
- se empezó a persistir `role` dentro de `socket.data`
- se ajustó el cambio de sala para `join/observer`
- se mantiene el `join`/`leave` correcto por sala

- `apps/server/src/services/game-coordinator.ts`

Qué se hizo:

- se agregó `listRooms()`
- se ajustó `removePlayer()` para no destruir de forma abrupta la sala cuando el último jugador sale
- el estado de sala vacía queda reseteado y reutilizable

- `apps/server/src/services/redis.service.ts`

Qué se hizo:

- se agregó soporte para listar IDs de salas
- se mantiene un índice de salas en persistencia
- funciona tanto con Redis como con fallback in-memory

### Mobile

- `apps/mobile/App.tsx`

Qué se hizo:

- se adaptó la pantalla para flujo de jugador
- se agregó `create_room`
- se agregó `join_game`
- se removió la dependencia práctica de una sala fija
- se mantiene el envío de:
  - `player_ready`
  - `roll_dice`
- se agregó lógica para auto-unirse a la sala recién creada
- la UI deja claro que mobile es `PLAYER`

### Web

- `apps/web/src/app/page.tsx`

Qué se hizo:

- se rediseñó el flujo como consola de observación
- se agregó `list_rooms`
- se agregó `join_as_observer`
- se quitó la lógica de jugar desde web
- se muestran salas disponibles y resumen por sala
- se muestra el estado observado de la partida
- se agregó temporalmente `create_room` solo para pruebas desde web
- la sala creada desde web se auto-observa para acelerar la validación del socket

Bloques temporales marcados en el código:

- `pendingAutoObserveCreatedRoomRef`
- `createRoomForTesting`
- listener `SocketEvents.ROOM_CREATED`
- botón `CREAR SALA (PRUEBA)`

Todos esos bloques tienen comentarios `TEMP QA WEB ONLY` para identificarlos rápido.

### Tests y configuración

- `apps/server/tests/socket-flow.test.ts`
- `apps/server/jest.config.cjs`
- `apps/web/tests/visitor-view.spec.ts`
- `apps/web/tsconfig.json`
- `rust-websocket-main.example.rs`
- `rust-websocket-Cargo.example.toml`

Qué se hizo:

- se actualizaron pruebas para el flujo nuevo
- se ajustó Jest del server para TypeScript/ESM
- se agregó prueba de:
  - multi-sala
  - observer bloqueado para acciones de jugador
  - creación/listado de salas
- se actualizó la prueba E2E de web para el modo observador
- se mantiene `ignoreDeprecations: "6.0"` en web para evitar el bloqueo por advertencias de TypeScript 6
- se agregaron archivos de referencia para reconstruir el servidor Rust externo con el contrato nuevo del realtime

## Flujo Nuevo Esperado

### Caso 1: Mobile crea partida nueva

1. Mobile se conecta al realtime.
2. Mobile emite `create_room`.
3. El backend crea la sala y responde `room_created`.
4. Mobile usa ese `roomId` y emite `join_game`.
5. El backend asocia esa conexión como:
   - `role = player`
   - `roomId = sala creada`
   - `playerId = id del jugador`
6. La sala empieza a recibir `game_update`, `player_joined`, etc.

### Caso 2: Otro mobile se une a esa partida

1. El segundo mobile introduce el `roomId`.
2. Emite `join_game`.
3. El backend lo mete a la misma sala como jugador.
4. Los eventos solo se emiten a esa sala.

### Caso 3: Web observa una sala

1. Web se conecta.
2. Web emite `list_rooms`.
3. El backend responde `rooms_list`.
4. Web elige una sala y emite `join_as_observer`.
5. El backend la asocia con:
   - `role = observer`
   - `roomId = sala elegida`
6. Web recibe `game_update` y demás eventos del juego.
7. Si web intenta jugar, el backend responde `error`.

### Caso temporal de pruebas: Web crea sala para validar el socket

1. Web se conecta.
2. Web emite `create_room`.
3. El backend responde `room_created`.
4. La web toma el `roomId` recibido.
5. La web emite `join_as_observer` automáticamente.
6. La web queda observando esa sala recién creada.

Este flujo es temporal y existe solo para pruebas mientras el equipo no puede validar desde mobile.

## Validaciones que ya quedaron implementadas

- un observador no puede hacer `player_ready`
- un observador no puede hacer `roll_dice`
- una conexión jugador solo puede actuar sobre:
  - su `roomId`
  - su `playerId`
- los broadcasts se hacen solo por sala
- al salir un jugador:
  - se remueve de su sala
  - se emite `player_left`
  - si la sala sigue existiendo, se emite `game_update`
- al salir un observador:
  - se elimina solo su presencia de observación
  - no se altera la lógica de jugadores

## Verificación Ejecutada

Se ejecutó y pasó:

```bash
pnpm --filter @dado-triple/server exec tsc --noEmit --pretty false
pnpm --filter @dado-triple/mobile exec tsc --noEmit --pretty false
pnpm --filter @dado-triple/web exec tsc --noEmit --pretty false
pnpm --filter @dado-triple/server test -- socket-flow.test.ts
pnpm --filter @dado-triple/web test -- visitor-view.spec.ts
```

Además:

- se instalaron los navegadores de Playwright para correr la prueba web localmente

## Qué Deben Saber los Compañeros de Diseño Web y Mobile

### Equipo Web

La web ya no debe diseñarse como cliente jugador.

La intención correcta ahora es:

- vista de salas disponibles
- entrada a sala como observador
- visualización del estado del juego
- visualización de jugadores, ronda, dados, logs o timeline

No hay que diseñar:

- botones de lanzar dados
- botones de ready
- flujos de registro de jugador para la web

Importante para el equipo de diseño:

- en este momento hay un botón temporal de `CREAR SALA (PRUEBA)` solo para testing
- ese botón NO representa el diseño final esperado
- la intención final sigue siendo que la web solo observe

### Equipo Mobile

La app móvil sí debe contemplar flujo completo de jugador:

- nombre del jugador
- crear sala
- copiar o compartir `roomId`
- unirse a sala existente
- estado de partida
- ready
- lanzar dados

## Punto Importante para Integración con AWS

Si el backend productivo actual sigue siendo el servidor Rust externo en AWS, entonces todavía falta asegurar que ese servidor implemente exactamente este contrato nuevo.

En particular, el servidor real debe soportar:

- `create_room`
- `join_game`
- `join_as_observer`
- `list_rooms`
- `room_created`
- `rooms_list`
- contexto por conexión con `roomId`, `playerId`, `role`
- aislamiento por sala
- bloqueo de acciones de jugador para `observer`

Archivos de referencia agregados en este repo para facilitar esa migración:

- `rust-websocket-main.example.rs`
- `rust-websocket-Cargo.example.toml`

Uso esperado:

- copiar `rust-websocket-main.example.rs` a `src/main.rs` en la EC2
- copiar `rust-websocket-Cargo.example.toml` a `Cargo.toml`
- correr `cargo run`
- volver a probar desde web y/o con un cliente manual

## Qué quitar antes de la entrega final

Si se quiere volver a la regla estricta de que solo mobile crea salas, hay que retirar en:

- `apps/web/src/app/page.tsx`

Bloques a comentar o eliminar:

1. `pendingAutoObserveCreatedRoomRef`
   - se usa solo para que la web se meta automáticamente a observar la sala recién creada

2. función `createRoomForTesting`
   - es el handler temporal que emite `create_room` desde la web

3. listener `client.on(SocketEvents.ROOM_CREATED, ...)`
   - se usa solo para captar la sala creada desde la web y auto-observarla

4. botón `CREAR SALA (PRUEBA)`
   - este botón debe desaparecer en la entrega final

5. texto UI:
   - `Modo temporal de prueba: la web puede crear sala...`

Después de quitar esos bloques:

- la web vuelve a quedar como observador puro
- mobile queda como único cliente autorizado para crear salas
- el resto del flujo multi-sala no se rompe

## Otros Cambios Previos Relevantes

Estos cambios ya venían hechos antes de cerrar el soporte multi-sala y siguen siendo importantes para integración:

### Conectividad realtime hacia AWS

- `apps/mobile/src/lib/realtime-client.ts`

Qué se hizo:

- se agregó soporte de failover entre endpoints
- se soporta transporte principal y fallback
- se muestra transporte activo y URL activa en mobile

Configuración actual por defecto:

- websocket: `ws://3.18.110.24:5000`
- fallback socket.io: `http://3.18.110.24:4000`

### Ajustes de tipado en mobile

Qué se había corregido:

- `apps/mobile/tsconfig.json`
  - tipos locales para `node`, `react` y `jest`
  - `typeRoots` locales del paquete mobile
- `apps/mobile/package.json`
  - alineación de tipos React 18
- `package.json` raíz
  - alineación de `@types/react` y `@types/react-dom`

Objetivo de esos cambios:

- evitar el error de `process` no encontrado
- evitar el choque de tipos React/JSX entre paquetes del monorepo

## Conclusión

Sí quedó hecho el cambio dentro del repositorio y sí quedó validado localmente.

No puedo afirmar que ya esté desplegado y funcionando en AWS/producción sin confirmar que el backend remoto activo haya sido actualizado con este mismo contrato.

Si el siguiente paso es dejarlo realmente “arriba”, la tarea pendiente ya no es de frontend local: es alinear o desplegar el backend realtime que está corriendo en AWS.

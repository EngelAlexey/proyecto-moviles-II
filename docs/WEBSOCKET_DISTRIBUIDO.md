# WebSocket Distribuido En AWS

Esta guia explica como mantener operativo el servidor WebSocket en Rust para que el equipo completo pueda conectarse desde web y mobile sin depender de `localhost`.

## Endpoint fijo

Los clientes del proyecto usan WebSocket nativo contra:

```txt
ws://18.218.158.112:5000
```

La configuracion ya no depende de:

- `NEXT_PUBLIC_REALTIME_TRANSPORT`
- `NEXT_PUBLIC_REALTIME_URL`
- `EXPO_PUBLIC_REALTIME_TRANSPORT`
- `EXPO_PUBLIC_REALTIME_URL`
- `localhost`
- `10.0.2.2`

## Comportamiento esperado de los clientes

- `web` conecta como `observer`
- `mobile` conecta como `player`
- ambos clientes usan mensajes con el contrato `{ "event": string, "payload": object }`

Eventos compatibles:

- `create_room`
- `list_rooms`
- `join_as_observer`
- `join_game`
- `player_ready`
- `roll_dice`
- `game_update`
- `player_joined`
- `pairs_assigned`
- `dice_rolled`

## Security Group en AWS

El servidor debe aceptar trafico entrante al puerto `5000`.

Regla requerida:

- Tipo: `Custom TCP`
- Puerto: `5000`
- Origen: `0.0.0.0/0`

## Servicio systemd

Archivo:

```txt
/etc/systemd/system/websocket.service
```

Contenido:

```ini
[Unit]
Description=Rust WebSocket Server
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/apps/websocket
ExecStart=/home/ubuntu/.cargo/bin/cargo run
Restart=always

[Install]
WantedBy=multi-user.target
```

## Activacion del servicio

```bash
sudo systemctl daemon-reload
sudo systemctl enable websocket
sudo systemctl start websocket
```

## Verificacion

```bash
sudo systemctl status websocket
sudo journalctl -u websocket -f
```

Senales sanas esperadas:

- el proceso queda `active (running)`
- el log muestra que escucha en `0.0.0.0:5000`
- el servicio sigue vivo aunque cierres la sesion SSH

## Validacion del equipo

### Web

1. Ejecuta `pnpm --filter @dado-triple/web dev`
2. Abre `http://localhost:3000`
3. Verifica `SOCKET: CONECTADO`
4. Verifica `URL activa: ws://18.218.158.112:5000`
5. Usa `CREAR SALA (PRUEBA)` solo para QA
6. Confirma que la web recibe `ROOM_CREATED`, `ROOMS_LIST` y `GAME_UPDATE`

### Mobile

1. Ejecuta `pnpm --filter @dado-triple/mobile start`
2. Abre la app desde Android o iPhone en cualquier red disponible
3. Verifica que el log muestre conexion al mismo endpoint publico
4. Crea o unete a una sala
5. Ejecuta `player_ready` y `roll_dice`

### Multi-dispositivo

Prueba minima recomendada:

1. 1 navegador como observador
2. 2 telefonos como jugadores
3. Crear una sala
4. Unir ambos jugadores
5. Marcar `ready` en ambos
6. Lanzar dados
7. Confirmar que el observador reciba actualizaciones en tiempo real

Prueba ampliada recomendada:

1. 1 navegador como observador
2. 4 jugadores conectados desde clientes distintos
3. Confirmar 2 parejas en la ronda 1
4. Confirmar que todos los `dice_rolled` lleguen al observador

## Riesgo conocido

Si la web se despliega bajo `https://`, este endpoint debera migrarse a `wss://` con TLS o con un proxy reverso delante del servicio Rust.

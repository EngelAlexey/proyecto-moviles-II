# Setup Local

Esta guia explica como preparar el monorepo para desarrollo local sin perder de vista que los clientes usan el WebSocket distribuido en AWS.

## Requisitos

- Node.js 18 o superior
- pnpm
- MongoDB Atlas
- Redis opcional para desarrollo local del backend Node

## Instalacion

Desde la raiz:

```bash
pnpm install
```

## Variables del backend Node

Archivo: `apps/server/.env`

```env
DATABASE_URL="mongodb+srv://<usuario>:<password>@cluster..."
PORT=4000
# REDIS_URL="redis://..."  # opcional para desarrollo
```

## Prisma

```bash
cd apps/server
npx prisma generate
cd ../..
```

## Levantar el monorepo

```bash
pnpm dev
```

Servicios locales esperados:

- Web: `http://localhost:3000`
- API/Socket Node: `http://localhost:4000`
- Mobile: Expo / Metro

## Realtime distribuido

Web y Mobile usan WebSocket nativo contra el endpoint configurado en sus `.env`.
Valores actuales:

```txt
ws://3.142.78.130:5000
```

Eso significa:

- si la IP publica cambia, el ajuste se hace en:
  - `apps/web/.env`
  - `apps/mobile/.env`
  - `apps/web/.env.example`
  - `apps/mobile/.env.example`
- `localhost` y `10.0.2.2` ya no se usan en los clientes
- para que el flujo realtime funcione, el servidor Rust en AWS debe estar levantado

Variables usadas:

```env
NEXT_PUBLIC_REALTIME_TRANSPORT=websocket
NEXT_PUBLIC_REALTIME_URL=ws://3.142.78.130:5000
EXPO_PUBLIC_REALTIME_TRANSPORT=websocket
EXPO_PUBLIC_REALTIME_URL=ws://3.142.78.130:5000
```

Los `.env` reales son locales y no se versionan. Por eso tambien se actualizan:

- `apps/web/.env.example`
- `apps/mobile/.env.example`

La guia operativa del servidor en AWS esta en [WEBSOCKET_DISTRIBUIDO.md](./WEBSOCKET_DISTRIBUIDO.md).

## Notas

- Si no configuras Redis, el backend Node puede usar fallback en memoria RAM para desarrollo.
- La web funciona como observador.
- Mobile funciona como jugador.

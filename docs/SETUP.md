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

## Variables de la app web

Archivo: `apps/web/.env`

```env
DATABASE_URL="mongodb+srv://<usuario>:<password>@cluster..."
```

La app web sigue observando el juego por WebSocket, pero ahora expone rutas
administrativas bajo `/dashboard/*` que leen historial y ranking directo desde MongoDB.

## Prisma

```bash
pnpm --filter @dado-triple/db prisma:generate
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

Web y Mobile usan WebSocket nativo fijo contra:

```txt
ws://18.218.158.112:5000
```

Eso significa:

- no hace falta configurar variables de entorno para el transporte realtime
- `localhost` y `10.0.2.2` ya no se usan en los clientes
- para que el flujo realtime funcione, el servidor Rust en AWS debe estar levantado

La guia operativa del servidor en AWS esta en [WEBSOCKET_DISTRIBUIDO.md](./WEBSOCKET_DISTRIBUIDO.md).

## Notas

- Si no configuras Redis, el backend Node puede usar fallback en memoria RAM para desarrollo.
- La web funciona como observador.
- Mobile funciona como jugador.

# Dado Triple Monorepo

Monorepo del proyecto Dado Triple con web, mobile, backend Node y contrato compartido para juego en tiempo real.

## Documentacion

- [Arquitectura](./docs/ARQUITECTURA.md)
- [Reglas del juego](./docs/REGLAS.md)
- [Setup local](./docs/SETUP.md)
- [WebSocket distribuido en AWS](./docs/WEBSOCKET_DISTRIBUIDO.md)

## Stack

- Monorepo: Turborepo + pnpm
- Web: Next.js
- Mobile: React Native con Expo
- Backend: Node.js + Express + Redis + Prisma
- Realtime distribuido: servidor WebSocket nativo en Rust desplegado en AWS
- Lenguaje: TypeScript

## Realtime actual

Los clientes web y mobile usan WebSocket nativo fijo contra:

```txt
ws://18.218.158.112:5000
```

No dependen de:

- `localhost`
- `10.0.2.2`
- `NEXT_PUBLIC_REALTIME_TRANSPORT`
- `NEXT_PUBLIC_REALTIME_URL`
- `EXPO_PUBLIC_REALTIME_TRANSPORT`
- `EXPO_PUBLIC_REALTIME_URL`

Roles esperados:

- `web` observa como `observer`
- `mobile` juega como `player`

## Instalacion

```bash
pnpm install
```

Configura `apps/server/.env` para MongoDB y Redis si vas a trabajar el backend Node:

```env
DATABASE_URL="mongodb+srv://..."
REDIS_URL="redis://..."
PORT=4000
```

Genera Prisma:

```bash
cd apps/server
npx prisma generate
cd ../..
```

## Desarrollo

Para levantar el monorepo:

```bash
pnpm dev
```

Servicios locales:

- Web: `http://localhost:3000`
- Server Node: `http://localhost:4000`
- Mobile: Expo / Metro

Importante:

- aunque levantes el monorepo localmente, web y mobile seguiran conectando al WebSocket distribuido en AWS
- la guia operativa del servicio Rust y `systemd` esta en [docs/WEBSOCKET_DISTRIBUIDO.md](./docs/WEBSOCKET_DISTRIBUIDO.md)

## Testing

Comandos utiles:

```bash
pnpm --filter @dado-triple/server exec tsc --noEmit --pretty false
pnpm --filter @dado-triple/mobile exec tsc --noEmit --pretty false
pnpm --filter @dado-triple/web exec tsc --noEmit --pretty false
pnpm --filter @dado-triple/server test -- socket-flow.test.ts
pnpm --filter @dado-triple/web test -- visitor-view.spec.ts
```

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
pnpm --filter @dado-triple/db prisma:generate
```

Si vas a usar el dashboard administrativo de `apps/web`, define también `DATABASE_URL` en
`apps/web/.env`.

## Desarrollo

Para levantar el monorepo:

```bash
pnpm dev
```

Ese comando levanta:

- `apps/web`
- `apps/server`
- `apps/mobile`

Si ya tienes otro `next dev` abierto en `apps/web`, cierralo antes o `pnpm dev` fallara por servidor duplicado.

Si solo quieres backend y web:

```bash
pnpm dev:no-mobile
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

## Deploy

### Web en Vercel

```bash
pnpm deploy:web
```

Requiere haber hecho `vercel login` al menos una vez y configurar el proyecto apuntando a `apps/web`.

### Server en Render

El repo incluye `render.yaml` para desplegar `apps/server` como servicio web Node.

Variables requeridas en Render:

- `DATABASE_URL`
- `REDIS_URL`
- `PORT=4000`

### Mobile instalable

Para generar un APK instalable de Android:

```bash
pnpm mobile:build:android:preview
```

Ese build usa EAS y produce un APK que puedes instalar en el telefono. Una vez instalado, la app se abre desde el icono como cualquier otra app, sin volver a usar `expo start`.

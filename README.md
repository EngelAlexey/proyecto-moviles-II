# 🎲 Dado Triple Monorepo

Bienvenido al monorepo de **Dado Triple**, un sistema interactivo en tiempo real diseñado para juegos de azar y estrategia. Este proyecto utiliza una arquitectura de monorepo moderna, escalable y robusta para gestionar aplicaciones web, móviles y el servidor central.

## 🚀 Tecnologías Core

Este proyecto está construido con un stack de vanguardia:

*   **Monorepo:** [Turborepo](https://turbo.build/) con [pnpm](https://pnpm.io/) para una gestión de espacios de trabajo eficiente.
*   **Backend:** Node.js, Express, Socket.io, Redis e [ioredis](https://github.com/luin/ioredis).
*   **Persistencia:** [Prisma ORM](https://www.prisma.io/) (v6 Stable) y MongoDB Atlas.
*   **Frontend Web:** [Next.js](https://nextjs.org/) (App Router) y TailwindCSS.
*   **Frontend Móvil:** [React Native](https://reactnative.dev/) mediante [Expo](https://expo.dev/) y NativeWind.
*   **Lenguaje:** TypeScript estricto en todo el workspace.
*   **Calidad de Código:** Husky para pre-commits, Jest para lógica de negocio y Playwright para E2E.

---

## 📁 Estructura del Proyecto

```text
.
├── apps/
│   ├── server/          # API REST + WebSocket (Socket.io)
│   ├── web/             # Aplicación Next.js (Dashboard/App Web)
│   └── mobile/          # Aplicación Expo (iOS/Android)
├── packages/
│   ├── game-logic/      # Motor de juego (Pure TS, Shared)
│   ├── shared-types/    # Tipos e interfaces comunes
│   ├── typescript-config/ # Configuraciones base de TS
│   └── tailwind-config/ # Configuración compartida de Tailwind
└── turbo.json           # Orquestación de pipelines
```

---

## 🛠️ Comenzando

### Requisitos Previos

*   [Node.js](https://nodejs.org/) (v18+)
*   [pnpm](https://pnpm.io/installation) (`npm install -g pnpm`)
*   Una instancia de **MongoDB Atlas**
*   Redis (opcional para desarrollo local, requerido para escalado de WebSockets)

### Instalación

1.  Clona el repositorio.
2.  Instala las dependencias desde la raíz:
    ```bash
    pnpm install
    ```
3.  Configura las variables de entorno en `apps/server/.env`:
    ```env
    DATABASE_URL="mongodb+srv://..."
    REDIS_URL="redis://..."
    PORT=4000
    ```

### Desarrollo

Para iniciar todos los servicios (Web, Mobile, Server) simultáneamente:

```bash
pnpm dev
```

### Infraestructura y Persistencia

*   **MongoDB Atlas:** Persistencia a largo plazo de jugadores, sesiones y movimientos.
*   **Redis / Memory Fallback:** 
    *   Si configuras `REDIS_URL` o `UPSTASH_REDIS_REST_*`, el sistema usará Redis para el estado de las partidas.
    *   **Zero-Config Mode:** Si no hay Redis disponible, el servidor usará automáticamente la **RAM local (In-Memory)**. Esto es ideal para desarrollo rápido sin dependencias externas.

```bash
cd apps/server
npx prisma generate
```

### Persistencia y Base de Datos (Server)
- **`apps/server/prisma/schema.prisma`**: Definición de modelos MongoDB Atlas.
- **`apps/server/prisma/PrismaService.ts`**: Implementación de **Singleton** para `PrismaClient`.
- **`apps/server/src/services/redis.service.ts`**: Servicio de estado con **Fallback In-Memory**. 
  - Si la conexión a Redis falla, conmuta automáticamente a un `Map` interno.
  - Soporta el mapeo automático de variables de Upstash (`UPSTASH_REDIS_REST_URL/TOKEN`) al protocolo TCP `rediss://`.

---

## 🧪 Testing

*   **Lógica de Juego:** `pnpm test` (ejecuta Jest en `packages/game-logic`).
*   **Web E2E:** `pnpm test:e2e` (próximamente con Playwright).

---

## 🤝 Contribuyendo

Este proyecto utiliza **Husky** para asegurar que el código cumpla con los estándares antes de subir cambios. Cada commit ejecutará automáticamente los tests y el linter.

---
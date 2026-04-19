# 🤖 AGENT.md: Contexto de IA para Dado Triple

Este documento está diseñado para proporcionar contexto técnico rápido a asistentes de IA (como Antigravity) para navegar, entender y asistir en el desarrollo de este monorepo eficientemente.

---

## 🏗️ Resumen de la Arquitectura (Turborepo)

-   **Jerarquía de Dependencias:** Un cambio en `packages/shared-types` o `packages/game-logic` afecta directamente a `apps/server`, `apps/web` y `apps/mobile`.
-   **Espacio de Trabajo (Workspace):** El gestor es `pnpm`. Usa siempre `pnpm` desde la raíz para orquestar builds y tests.

---

## 📦 File Mapping y Fuentes de Verdad

### Lógica de Negocio (Motor de Juego)
-   **`packages/game-logic/src/`**: Contiene el motor estadístico y de reglas (`engine.ts`).
-   **Importante:** Nunca dupliques lógica de tiradas de dados o cálculo de puntajes en las aplicaciones; impórtala siempre del paquete `game-logic`.

### Tipado y Contratos (Shared)
-   **`packages/shared-types/src/index.ts`**: Fuente de verdad para interfaces de modelos Prisma, eventos de Socket.io y DTOs compartidos.

### Persistencia y Base de Datos (Server)
-   **`packages/db/prisma/schema.prisma`**: Fuente de verdad de los modelos Prisma/MongoDB Atlas.
-   **`packages/db/src/index.ts`**: Implementación de **Singleton** para `PrismaClient`, compartida por `apps/server` y `apps/web`.
-   **`apps/server/src/prisma/PrismaService.ts`**: Re-export de compatibilidad para no romper imports existentes en el backend.
-   **Importante:** Este proyecto utiliza **Prisma v6 Stable**. No intentes usar archivos `prisma.config.ts` ni configuraciones de la v7.

---

## ⚡ Patrones de Diseño Críticos

1.  **Singleton de Prisma:** La conexión a MongoDB Atlas se gestiona mediante una única instancia global para evitar saturar el pool de conexiones durante hot-reloads en desarrollo.
2.  **Graceful Shutdown:** El servidor (`apps/server/src/index.ts`) escucha señales `SIGINT`/`SIGTERM` para desconectar Prisma y cerrar el servidor WebSocket limpiamente.
3.  **Lógica del Juego Pura:** El motor del juego es determinístico y está aislado de efectos secundarios para permitir testing unitario exhaustivo.

---

## 🚦 Flujos de Trabajo Comunes (CLI Context)

-   **Regenerar Tipos Prisma:** `pnpm --filter @dado-triple/db prisma:generate`
-   **Probar Conexión DB:** `cd apps/server && pnpm test:db`
-   **Ejecutar Todo el Workspace:** `pnpm turbo build` o `pnpm dev`
-   **Añadir Dependencias Comunes:** Use `pnpm -F <package-name> add <dep-name>`

---

## 🛠️ Entorno de Desarrollo (Local Context)

-   **Puerto Server:** 4000 (predefinido para Socket.io y Web).
-   **Puerto Web:** 3000 (Next.js).
-   **Puerto Mobile:** 8081 (Expo/Metro).
-   **Variables Clave:** `DATABASE_URL` (MongoDB Atlas) es mandataria para el servidor.

---

## 🎯 Directivas para Asistentes

-   **Precaución:** La propiedad real del schema Prisma vive en `packages/db`; no dupliques definiciones en `apps/server`.
-   **Consistencia:** Asegúrate de que las interfaces en `shared-types` se mantengan sincronizadas con los campos definidos en `packages/db/prisma/schema.prisma`.
-   **Testing:** Siempre que agregues lógica de juego, acompaña con un test unitario en `packages/game-logic/src/__tests__`.

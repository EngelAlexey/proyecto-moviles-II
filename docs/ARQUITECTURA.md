# 🏗️ Arquitectura del Sistema - Dado Triple

Este documento detalla la estructura técnica, flujo de datos y decisiones de diseño del proyecto Dado Triple Monorepo.

## Gestión del Monorepo
El proyecto utiliza una arquitectura de **Monorepo** moderna para mantener la consistencia entre el cliente y el servidor.
- **Orquestador:** [Turborepo](https://turbo.build/) para ejecución paralela de tareas (build, lint, dev).
- **Gestor de Paquetes:** [pnpm](https://pnpm.io/) con workspaces para una gestión eficiente de dependencias y linkeo interno.

## Capas del Sistema

### 1. Backend (`apps/server`)
Servidor central robusto encargado de la lógica de negocio y estado en tiempo real.
- **Framework:** Node.js + Express.
- **Tiempo Real:** Socket.io para comunicación bidireccional de baja latencia.
- **Motor de Juego:** `GameCoordinator` que orquestra el ciclo de vida de cada sesión.

### 2. Persistencia Híbrida
El sistema utiliza una estrategia de almacenamiento de dos niveles para maximizar rendimiento:
- **Estado Rápido (Redis):** Almacena el estado temporal de las salas (jugadores listos, puntuación de la ronda). Incluye un **fallback automático en memoria RAM** (Zero-Config) si Redis no está disponible.
- **Historial Persistente (MongoDB Atlas):** Mediante [Prisma ORM](https://www.prisma.io/), se guardan permanentemente los perfiles de jugadores, sesiones terminadas y el historial de cada lanzamiento individual.

### 3. Frontends
- **Web:** Desarrollado con **Next.js 15+** y TailwindCSS para una experiencia de escritorio premium.
- **Móvil:** Aplicación nativa con **React Native (Expo)** y NativeWind, optimizada para Android e iOS.

### 4. Paquetes Compartidos (`packages/`)
- **`shared-types`:** Definiciones de TypeScript e interfaces comunes para evitar errores de comunicación.
- **`game-logic`:** El motor puro de cálculo de dados y emparejamiento, desacoplado del servidor.
- **`typescript-config`:** Configuraciones base de TS compartidas.

## Flujo de Comunicación
1. El cliente inicia un evento vía **Socket.io** (ej. `JOIN_GAME`).
2. El `SocketHandler` delega en el `GameCoordinator`.
3. El estado se recupera y actualiza en **Redis**.
4. Se dispara un guardado asíncrono ("fire-and-forget") a **MongoDB** para telemetría y persistencia.
5. El servidor emite `GAME_UPDATE` a todos los jugadores de la sala con el nuevo estado.

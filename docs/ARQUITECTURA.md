# Arquitectura Del Sistema

## Vision general

El proyecto usa un monorepo con clientes web y mobile, un backend Node para servicios del repositorio y un servidor WebSocket nativo en Rust desplegado en AWS para el tiempo real distribuido.

## Capas principales

### Web

- Next.js
- funciona como `observer`
- consume el endpoint configurado en `apps/web/.env`

### Mobile

- React Native con Expo
- funciona como `player`
- consume el endpoint configurado en `apps/mobile/.env`

### Backend Node

- Express
- Prisma
- Redis con fallback en memoria
- mantiene logica de coordinacion y pruebas del repositorio

### Realtime distribuido

- servidor WebSocket nativo en Rust
- mensajes en formato `{ event, payload }`
- desplegado en AWS y administrado como servicio

## Flujo de comunicacion

1. El cliente abre un WebSocket contra la URL configurada en su `.env`
2. El cliente envia mensajes `{ event, payload }`
3. El servidor procesa la accion segun sala y rol
4. El estado del juego se actualiza
5. El servidor emite eventos de vuelta a la sala correspondiente

## Paquetes compartidos

- `packages/shared-types`: contrato de eventos y tipos comunes
- `packages/game-logic`: motor puro del juego
- `packages/typescript-config`: configuracion base
- `packages/tailwind-config`: configuracion compartida de estilos

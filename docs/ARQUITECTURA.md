# Arquitectura Del Sistema

## Vision general

El proyecto usa un monorepo con clientes web y mobile, un backend Node para servicios del repositorio y un servidor WebSocket nativo en Rust desplegado en AWS para el tiempo real distribuido.

## Capas principales

### Web

- Next.js
- funciona como `observer`
- consume el endpoint fijo `ws://18.218.158.112:5000`

### Mobile

- React Native con Expo
- funciona como `player`
- consume el mismo endpoint fijo `ws://18.218.158.112:5000`

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

1. El cliente abre un WebSocket contra `ws://18.218.158.112:5000`
2. El cliente envia mensajes `{ event, payload }`
3. El servidor procesa la accion segun sala y rol
4. El estado del juego se actualiza
5. El servidor emite eventos de vuelta a la sala correspondiente

## Paquetes compartidos

- `packages/shared-types`: contrato de eventos y tipos comunes
- `packages/game-logic`: motor puro del juego
- `packages/typescript-config`: configuracion base
- `packages/tailwind-config`: configuracion compartida de estilos

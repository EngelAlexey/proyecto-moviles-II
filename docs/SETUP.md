# ⚙️ Guía de Desarrollo e Instalación - Dado Triple

Este documento explica cómo configurar tu entorno local para desarrollar y probar el monorepo Dado Triple.

## Requisitos Previos

- **Node.js:** Versión 18 o superior.
- **pnpm:** Gestor de paquetes recomendado. Instálalo con `npm install -g pnpm`.
- **MongoDB Atlas:** Una instancia activa en la nube para persistencia.

## Pasos de Instalación

### 1. Clonar e Instalar
Desde la raíz del proyecto, instala todas las dependencias de los paquetes internos y aplicaciones con un solo comando:
```bash
pnpm install
```

### 2. Configurar Variables de Entorno
Crea o edita el archivo en `apps/server/.env` e incluye al menos la URL de tu base de datos MongoDB:
```env
# apps/server/.env
DATABASE_URL="mongodb+srv://<usuario>:<password>@cluster..."
PORT=4000
# REDIS_URL="redis://..." (Opcional, en desarrollo usa RAM interna)
```

### 3. Generar Modelos de Base de Datos
Prepara **Prisma ORM** para interactuar con MongoDB Atlas ejecutando la generación de tipos:
```bash
cd apps/server
npx prisma generate
cd ../..
```

### 4. Ejecución del Monorepo
Usa la potencia de **Turborepo** para levantar todos los servicios (Web, Móvil y Servidor) simultáneamente:
```bash
pnpm dev
```

### 5. Servicios Levantados
- **Web:** [http://localhost:3000](http://localhost:3000)
- **Servidor API/Socket:** [http://localhost:4000](http://localhost:4000)
- **Móvil (Metro):** Escanea el código QR de Expo en tu terminal.

### 6. Cambiar a WebSocket para Rust

Cuando el servidor en Rust este disponible, activa el modo `websocket`:

```env
# apps/web/.env.local
NEXT_PUBLIC_REALTIME_TRANSPORT=websocket
NEXT_PUBLIC_REALTIME_URL=ws://localhost:5000

# apps/mobile/.env
EXPO_PUBLIC_REALTIME_TRANSPORT=websocket
EXPO_PUBLIC_REALTIME_URL=ws://10.0.2.2:5000
```

Si necesitas seguir usando el backend actual de Node, deja `socket.io` como transporte o simplemente omite esas variables.

## Consejos de Desarrollo
- **Zero-Config Redis:** Si no configuras `REDIS_URL` en el `.env`, el servidor activará automáticamente el modo de respaldo en memoria RAM para facilitar pruebas locales.
- **Deduplicación:** El servidor cuenta con un sistema de auto-sanación que limpia a los jugadores duplicados en cada interacción.
- **ESM Native:** El proyecto utiliza módulos de ECMAScript (`type: module`) nativos para una arquitectura moderna y eficiente.

# Implementación de WebSocket en Rust para Dado Triple

## Contexto General

Se reemplazó el backend original basado en Socket.IO (Node.js) por un servidor en Rust utilizando WebSocket nativo. El objetivo fue mantener compatibilidad con el frontend existente respetando un contrato de comunicación basado en mensajes JSON estructurados.

---

## Arquitectura de Comunicación

### Formato de entrada (cliente → servidor)

```json
{
  "event": "join_game",
  "payload": { ... }
}

Formato de salida (servidor → cliente)

{
  "event": "game_update",
  "payload": { ... }
}

Configuración del Servidor WebSocket en Rust

Dependencias (Cargo.toml)

[dependencies]
tokio = { version = "1", features = ["full"] }
tokio-tungstenite = "0.21"
futures-util = "0.3"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
Implementación base (main.rs)
Uso de TcpListener para aceptar conexiones entrantes
Uso de accept_async para realizar el handshake WebSocket
Manejo concurrente de conexiones mediante tokio::spawn
Procesamiento de mensajes JSON con serde_json

Configuración de binding:

TcpListener::bind("0.0.0.0:5000")

Procesamiento de mensajes:

if msg.is_text() {
    let text = msg.to_text().unwrap();
    let parsed: Result<Value, _> = serde_json::from_str(text);
}
Configuración de Red (AWS)

Se configuró el Security Group para permitir conexiones entrantes:

Puerto	Protocolo	Origen
5000	TCP	0.0.0.0/0
Configuración del Frontend
Cambio de transporte

Se eliminó el uso de Socket.IO y se forzó el uso de WebSocket nativo.

transport: 'websocket'
URL del servidor

Se reemplazó la conexión local:

http://localhost:4000

por:

ws://<IP_PUBLICA>:5000

Ejemplo:

const SERVER_URL = 'ws://3.18.110.24:5000';
Eliminación de override global

Se deshabilitó el factory global que forzaba el uso de Socket.IO:

// window.__DADO_REALTIME_CLIENT_FACTORY__
Forzado de WebSocket

Se modificó la función de creación del cliente:

export function createRealtimeClient(...) {
  return createWebSocketClient(...);
}
Pruebas de Conectividad
Prueba manual en navegador
const ws = new WebSocket("ws://3.18.110.24:5000");

ws.onopen = () => console.log("CONECTADO");
ws.onerror = (e) => console.log("ERROR", e);
Resultado esperado en servidor
Servidor escuchando en puerto 5000...
Cliente conectado
Recibido: {"event":"join_game",...}
Problemas encontrados y soluciones
Problema	Causa	Solución
Uso persistente de Socket.IO	Override global activo	Eliminación del factory
Fallo de conexión	Puerto cerrado	Apertura de puerto 5000
Error 104 (connection reset)	Uso de TCP sin protocolo WebSocket	Implementación con tokio-tungstenite
Conexión a localhost	Uso de variables de entorno	Forzado de URL remota
Eventos no recibidos	Transporte incorrecto	Forzado de WebSocket
Flujo de comunicación
Frontend → WebSocket → Servidor Rust
          JSON (event, payload)
Estado actual
Conexión WebSocket establecida
Recepción de mensajes JSON funcional
Integración frontend y backend operativa
Infraestructura lista para lógica de juego
Próximos pasos
Implementación de eventos:
join_game
player_joined
game_update
Manejo de salas mediante roomId
Emisión de eventos a múltiples clientes
Gestión del estado del juego en memoria

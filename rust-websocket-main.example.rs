use std::{collections::HashMap, net::SocketAddr, sync::Arc};

use futures_util::{SinkExt, StreamExt};
use rand::Rng;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::{
    net::{TcpListener, TcpStream},
    sync::{mpsc, Mutex},
};
use tokio_tungstenite::{
    accept_hdr_async,
    tungstenite::{
        handshake::server::{Request, Response},
        Message,
    },
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum GameStatus {
    Waiting,
    Pairing,
    Playing,
    Finished,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Player {
    id: String,
    name: String,
    score: u32,
    is_ready: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Pair {
    player1_id: String,
    player2_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GameState {
    session_id: String,
    players: Vec<Player>,
    pairs: Vec<Pair>,
    current_dice: [u8; 3],
    status: GameStatus,
    round: u32,
    max_rounds: u32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RoomSummary {
    room_id: String,
    session_id: String,
    status: GameStatus,
    round: u32,
    max_rounds: u32,
    player_count: usize,
    observer_count: usize,
    player_names: Vec<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ConnectionRole {
    Player,
    Observer,
}

#[derive(Clone, Debug)]
struct RoomState {
    state: GameState,
    observer_count: usize,
}

#[derive(Clone)]
struct ClientRecord {
    tx: mpsc::UnboundedSender<Message>,
    room_id: Option<String>,
    player_id: Option<String>,
    role: Option<ConnectionRole>,
}

struct ServerState {
    rooms: HashMap<String, RoomState>,
    clients: HashMap<u64, ClientRecord>,
    next_client_id: u64,
    next_player_id: u64,
    next_session_id: u64,
}

#[derive(Debug, Deserialize)]
struct IncomingMessage {
    event: String,
    #[serde(default)]
    payload: Value,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CreateRoomPayload {
    room_id: Option<String>,
    max_rounds: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JoinGamePayload {
    room_id: String,
    player_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JoinAsObserverPayload {
    room_id: String,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ListRoomsPayload {
    include_finished: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlayerActionPayload {
    room_id: String,
    player_id: String,
}

#[tokio::main]
async fn main() {
    let listener = TcpListener::bind("0.0.0.0:5000")
        .await
        .expect("Error al iniciar servidor");

    let state = Arc::new(Mutex::new(ServerState {
        rooms: HashMap::new(),
        clients: HashMap::new(),
        next_client_id: 1,
        next_player_id: 1,
        next_session_id: 1,
    }));

    println!("Servidor WebSocket escuchando en puerto 5000...");

    loop {
        match listener.accept().await {
            Ok((stream, addr)) => {
                let shared = Arc::clone(&state);
                tokio::spawn(async move {
                    handle_connection(stream, addr, shared).await;
                });
            }
            Err(error) => {
                eprintln!("Error aceptando conexion: {error}");
            }
        }
    }
}

async fn handle_connection(
    stream: TcpStream,
    addr: SocketAddr,
    shared: Arc<Mutex<ServerState>>,
) {
    let ws_stream = match accept_hdr_async(stream, |req: &Request, response: Response| {
        println!("Handshake desde {addr} -> {}", req.uri());
        Ok(response)
    })
    .await
    {
        Ok(ws) => ws,
        Err(error) => {
            eprintln!("Handshake fallido desde {addr}: {error}");
            return;
        }
    };

    println!("Cliente conectado: {addr}");

    let (mut writer, mut reader) = ws_stream.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    let client_id = {
        let mut state = shared.lock().await;
        let client_id = state.next_client_id;
        state.next_client_id += 1;
        state.clients.insert(
            client_id,
            ClientRecord {
                tx: tx.clone(),
                room_id: None,
                player_id: None,
                role: None,
            },
        );
        client_id
    };

    let writer_task = tokio::spawn(async move {
        while let Some(message) = rx.recv().await {
            if writer.send(message).await.is_err() {
                break;
            }
        }
    });

    while let Some(next_message) = reader.next().await {
        match next_message {
            Ok(message) if message.is_text() => {
                match message.into_text() {
                    Ok(text) => {
                        println!("Recibido desde {addr}: {text}");
                        handle_text_message(&shared, client_id, &text).await;
                    }
                    Err(error) => {
                        eprintln!("Texto invalido desde {addr}: {error}");
                    }
                }
            }
            Ok(message) if message.is_close() => {
                println!("Cliente cerro conexion: {addr}");
                break;
            }
            Ok(_) => {}
            Err(error) => {
                eprintln!("Error de conexion desde {addr}: {error}");
                break;
            }
        }
    }

    writer_task.abort();
    handle_disconnect(&shared, client_id).await;
    println!("Cliente desconectado: {addr}");
}

async fn handle_text_message(shared: &Arc<Mutex<ServerState>>, client_id: u64, text: &str) {
    let parsed = match serde_json::from_str::<IncomingMessage>(text) {
        Ok(message) => message,
        Err(error) => {
            let mut state = shared.lock().await;
            send_error(&mut state, client_id, format!("JSON invalido: {error}"));
            return;
        }
    };

    let mut state = shared.lock().await;

    match parsed.event.as_str() {
        "list_rooms" => {
            let payload = serde_json::from_value::<ListRoomsPayload>(parsed.payload).unwrap_or_default();
            let include_finished = payload.include_finished.unwrap_or(false);
            let mut rooms = list_rooms(&state, include_finished);
            rooms.sort_by(|left, right| left.room_id.cmp(&right.room_id));
            send_to_client(
                &state,
                client_id,
                "rooms_list",
                json!({ "rooms": rooms }),
            );
        }
        "create_room" => {
            let payload = serde_json::from_value::<CreateRoomPayload>(parsed.payload).unwrap_or_default();
            let requested_room_id = payload.room_id.unwrap_or_else(generate_room_id);
            let room_id = requested_room_id.trim().to_string();

            if room_id.is_empty() {
                send_error(&mut state, client_id, "Debes indicar un roomId valido.".to_string());
                return;
            }

            if state.rooms.contains_key(&room_id) {
                send_error(
                    &mut state,
                    client_id,
                    format!("La sala \"{room_id}\" ya existe."),
                );
                return;
            }

            let state_snapshot = create_room(&mut state, &room_id, payload.max_rounds.unwrap_or(5));
            let summary = room_summary(&room_id, state.rooms.get(&room_id).unwrap());

            send_to_client(
                &state,
                client_id,
                "room_created",
                json!({
                    "room": summary,
                    "state": state_snapshot,
                }),
            );
        }
        "join_as_observer" => {
            let payload = match serde_json::from_value::<JoinAsObserverPayload>(parsed.payload) {
                Ok(payload) => payload,
                Err(error) => {
                    send_error(&mut state, client_id, format!("Payload invalido: {error}"));
                    return;
                }
            };

            let room_id = payload.room_id.trim().to_string();
            if room_id.is_empty() {
                send_error(&mut state, client_id, "Debes indicar un roomId valido.".to_string());
                return;
            }

            if !state.rooms.contains_key(&room_id) {
                send_error(
                    &mut state,
                    client_id,
                    format!("La sala \"{room_id}\" no existe."),
                );
                return;
            }

            detach_client_from_room(&mut state, client_id);

            let state_snapshot = {
                let room = state.rooms.get_mut(&room_id).unwrap();
                room.observer_count += 1;
                room.state.clone()
            };

            if let Some(client) = state.clients.get_mut(&client_id) {
                client.room_id = Some(room_id.clone());
                client.player_id = None;
                client.role = Some(ConnectionRole::Observer);
            }

            send_to_client(
                &state,
                client_id,
                "game_update",
                json!({ "state": state_snapshot }),
            );
        }
        "join_game" => {
            let payload = match serde_json::from_value::<JoinGamePayload>(parsed.payload) {
                Ok(payload) => payload,
                Err(error) => {
                    send_error(&mut state, client_id, format!("Payload invalido: {error}"));
                    return;
                }
            };

            let room_id = payload.room_id.trim().to_string();
            let player_name = payload.player_name.trim().to_string();

            if room_id.is_empty() {
                send_error(&mut state, client_id, "Debes indicar un roomId valido.".to_string());
                return;
            }

            if player_name.is_empty() {
                send_error(&mut state, client_id, "Debes indicar un nombre de jugador.".to_string());
                return;
            }

            if !state.rooms.contains_key(&room_id) {
                create_room(&mut state, &room_id, 5);
            }

            detach_client_from_room(&mut state, client_id);

            let room_is_waiting = state
                .rooms
                .get(&room_id)
                .map(|room| matches!(room.state.status, GameStatus::Waiting))
                .unwrap_or(false);

            if !room_is_waiting {
                send_error(
                    &mut state,
                    client_id,
                    "La partida ya comenzo. No se pueden unir mas jugadores nuevos.".to_string(),
                );
                return;
            }

            let existing_player = state
                .rooms
                .get(&room_id)
                .and_then(|room| {
                    room.state
                        .players
                        .iter()
                        .find(|player| player.name == player_name)
                        .cloned()
                });

            let player = if let Some(existing_player) = existing_player {
                existing_player
            } else {
                let player = Player {
                    id: format!("player-{}", state.next_player_id),
                    name: player_name.clone(),
                    score: 0,
                    is_ready: false,
                };
                state.next_player_id += 1;

                if let Some(room) = state.rooms.get_mut(&room_id) {
                    room.state.players.push(player.clone());
                }

                player
            };

            if let Some(client) = state.clients.get_mut(&client_id) {
                client.room_id = Some(room_id.clone());
                client.player_id = Some(player.id.clone());
                client.role = Some(ConnectionRole::Player);
            }

            let state_snapshot = state.rooms.get(&room_id).unwrap().state.clone();
            broadcast_to_room(
                &state,
                &room_id,
                "player_joined",
                json!({
                    "player": player,
                    "totalPlayers": state_snapshot.players.len(),
                }),
            );
            broadcast_to_room(
                &state,
                &room_id,
                "game_update",
                json!({ "state": state_snapshot }),
            );
        }
        "player_ready" => {
            let payload = match serde_json::from_value::<PlayerActionPayload>(parsed.payload) {
                Ok(payload) => payload,
                Err(error) => {
                    send_error(&mut state, client_id, format!("Payload invalido: {error}"));
                    return;
                }
            };

            if !validate_player_action(&mut state, client_id, &payload.room_id, &payload.player_id, "marcar ready") {
                return;
            }

            let Some((state_snapshot, maybe_pairs)) = ({
                let room = state.rooms.get_mut(&payload.room_id);
                room.map(|room| {
                    if let Some(player) = room
                        .state
                        .players
                        .iter_mut()
                        .find(|player| player.id == payload.player_id)
                    {
                        player.is_ready = true;
                    }

                    let all_ready = room.state.players.len() >= 2
                        && room.state.players.iter().all(|player| player.is_ready);

                    if all_ready {
                        room.state.status = GameStatus::Playing;
                        room.state.round = 1;

                        let player_ids = room
                            .state
                            .players
                            .iter()
                            .map(|player| player.id.clone())
                            .collect::<Vec<_>>();
                        let (pairs, bye) = assign_pairs(&player_ids);
                        room.state.pairs = pairs.clone();

                        (
                            room.state.clone(),
                            Some((pairs, bye, room.state.round)),
                        )
                    } else {
                        (room.state.clone(), None)
                    }
                })
            }) else {
                send_error(
                    &mut state,
                    client_id,
                    format!("La sala \"{}\" no existe.", payload.room_id),
                );
                return;
            };

            broadcast_to_room(
                &state,
                &payload.room_id,
                "game_update",
                json!({ "state": state_snapshot }),
            );

            if let Some((pairs, bye, round)) = maybe_pairs {
                broadcast_to_room(&state, &payload.room_id, "game_start", json!({}));
                broadcast_to_room(
                    &state,
                    &payload.room_id,
                    "pairs_assigned",
                    json!({
                        "pairs": pairs,
                        "bye": bye,
                        "round": round,
                    }),
                );
            }
        }
        "roll_dice" => {
            let payload = match serde_json::from_value::<PlayerActionPayload>(parsed.payload) {
                Ok(payload) => payload,
                Err(error) => {
                    send_error(&mut state, client_id, format!("Payload invalido: {error}"));
                    return;
                }
            };

            if !validate_player_action(&mut state, client_id, &payload.room_id, &payload.player_id, "lanzar dados") {
                return;
            }

            let room_exists = state.rooms.contains_key(&payload.room_id);
            if !room_exists {
                send_error(
                    &mut state,
                    client_id,
                    format!("La sala \"{}\" no existe.", payload.room_id),
                );
                return;
            }

            let room_is_playing = state
                .rooms
                .get(&payload.room_id)
                .map(|room| matches!(room.state.status, GameStatus::Playing))
                .unwrap_or(false);

            if !room_is_playing {
                send_error(&mut state, client_id, "La partida no esta en curso.".to_string());
                return;
            }

            let dice = roll_dice();
            let (combo, score) = calculate_combo_and_score(dice);
            let state_snapshot = {
                let room = state.rooms.get_mut(&payload.room_id).unwrap();

                if let Some(player) = room
                    .state
                    .players
                    .iter_mut()
                    .find(|player| player.id == payload.player_id)
                {
                    player.score += score;
                }

                room.state.current_dice = dice;
                room.state.clone()
            };

            broadcast_to_room(
                &state,
                &payload.room_id,
                "dice_rolled",
                json!({
                    "playerId": payload.player_id,
                    "dice": dice,
                    "combo": combo,
                    "score": score,
                }),
            );
            broadcast_to_room(
                &state,
                &payload.room_id,
                "game_update",
                json!({ "state": state_snapshot }),
            );
        }
        _ => {
            send_error(&mut state, client_id, format!("Evento no soportado: {}", parsed.event));
        }
    }
}

async fn handle_disconnect(shared: &Arc<Mutex<ServerState>>, client_id: u64) {
    let mut state = shared.lock().await;
    detach_client_from_room(&mut state, client_id);
    state.clients.remove(&client_id);
}

fn create_room(state: &mut ServerState, room_id: &str, max_rounds: u32) -> GameState {
    let session_id = format!("session-{}", state.next_session_id);
    state.next_session_id += 1;

    let room_state = RoomState {
        state: GameState {
            session_id,
            players: Vec::new(),
            pairs: Vec::new(),
            current_dice: [0, 0, 0],
            status: GameStatus::Waiting,
            round: 0,
            max_rounds: max_rounds.max(1),
        },
        observer_count: 0,
    };

    let snapshot = room_state.state.clone();
    state.rooms.insert(room_id.to_string(), room_state);
    snapshot
}

fn room_summary(room_id: &str, room: &RoomState) -> RoomSummary {
    RoomSummary {
        room_id: room_id.to_string(),
        session_id: room.state.session_id.clone(),
        status: room.state.status.clone(),
        round: room.state.round,
        max_rounds: room.state.max_rounds,
        player_count: room.state.players.len(),
        observer_count: room.observer_count,
        player_names: room
            .state
            .players
            .iter()
            .map(|player| player.name.clone())
            .collect(),
    }
}

fn list_rooms(state: &ServerState, include_finished: bool) -> Vec<RoomSummary> {
    state
        .rooms
        .iter()
        .filter(|(_, room)| include_finished || !matches!(room.state.status, GameStatus::Finished))
        .map(|(room_id, room)| room_summary(room_id, room))
        .collect()
}

fn detach_client_from_room(state: &mut ServerState, client_id: u64) {
    let Some(existing_client) = state.clients.get(&client_id).cloned() else {
        return;
    };

    let Some(room_id) = existing_client.room_id.clone() else {
        return;
    };

    match existing_client.role {
        Some(ConnectionRole::Observer) => {
            if let Some(room) = state.rooms.get_mut(&room_id) {
                if room.observer_count > 0 {
                    room.observer_count -= 1;
                }
            }
        }
        Some(ConnectionRole::Player) => {
            let mut state_snapshot = None;

            if let Some(player_id) = existing_client.player_id.clone() {
                if let Some(room) = state.rooms.get_mut(&room_id) {
                    room.state.players.retain(|player| player.id != player_id);

                    if room.state.players.is_empty() {
                        room.state.status = GameStatus::Waiting;
                        room.state.round = 0;
                        room.state.pairs.clear();
                        room.state.current_dice = [0, 0, 0];
                    }

                    state_snapshot = Some(room.state.clone());
                }

                broadcast_to_room(
                    state,
                    &room_id,
                    "player_left",
                    json!({ "playerId": player_id }),
                );
            }

            if let Some(snapshot) = state_snapshot {
                broadcast_to_room(
                    state,
                    &room_id,
                    "game_update",
                    json!({ "state": snapshot }),
                );
            }
        }
        None => {}
    }

    if let Some(client) = state.clients.get_mut(&client_id) {
        client.room_id = None;
        client.player_id = None;
        client.role = None;
    }
}

fn validate_player_action(
    state: &mut ServerState,
    client_id: u64,
    room_id: &str,
    player_id: &str,
    action_label: &str,
) -> bool {
    let Some((client_room_id, client_player_id, client_role)) = state
        .clients
        .get(&client_id)
        .map(|client| (client.room_id.clone(), client.player_id.clone(), client.role))
    else {
        send_error(state, client_id, "La conexion no existe.".to_string());
        return false;
    };

    if client_role != Some(ConnectionRole::Player) {
        send_error(
            state,
            client_id,
            format!("Solo un jugador puede {action_label}."),
        );
        return false;
    }

    if client_room_id.as_deref() != Some(room_id) || client_player_id.as_deref() != Some(player_id) {
        send_error(
            state,
            client_id,
            "La accion no coincide con la sala o el jugador asociados a esta conexion.".to_string(),
        );
        return false;
    }

    true
}

fn assign_pairs(player_ids: &[String]) -> (Vec<Pair>, Option<String>) {
    let mut pairs = Vec::new();
    let mut bye = None;
    let mut index = 0;

    while index < player_ids.len() {
        if index + 1 < player_ids.len() {
            pairs.push(Pair {
                player1_id: player_ids[index].clone(),
                player2_id: player_ids[index + 1].clone(),
            });
        } else {
            bye = Some(player_ids[index].clone());
        }

        index += 2;
    }

    (pairs, bye)
}

fn roll_dice() -> [u8; 3] {
    let mut rng = rand::thread_rng();
    [
        rng.gen_range(1..=6),
        rng.gen_range(1..=6),
        rng.gen_range(1..=6),
    ]
}

fn calculate_combo_and_score(dice: [u8; 3]) -> (&'static str, u32) {
    let sum = dice.iter().map(|value| *value as u32).sum::<u32>();

    if dice[0] == dice[1] && dice[1] == dice[2] {
        ("triple", sum + 100)
    } else if dice[0] == dice[1] || dice[0] == dice[2] || dice[1] == dice[2] {
        ("par", sum + 25)
    } else {
        ("nada", sum)
    }
}

fn generate_room_id() -> String {
    let suffix = rand::thread_rng().gen_range(100000..=999999);
    format!("room-{suffix}")
}

fn send_error(state: &mut ServerState, client_id: u64, message: String) {
    send_to_client(
        state,
        client_id,
        "error",
        json!({
            "message": message,
        }),
    );
}

fn send_to_client(state: &ServerState, client_id: u64, event: &str, payload: Value) {
    let Some(client) = state.clients.get(&client_id) else {
        return;
    };

    let serialized = serialize_event(event, payload);
    let _ = client.tx.send(Message::Text(serialized.into()));
}

fn broadcast_to_room(state: &ServerState, room_id: &str, event: &str, payload: Value) {
    let serialized = serialize_event(event, payload);

    for client in state.clients.values() {
        if client.room_id.as_deref() == Some(room_id) {
            let _ = client.tx.send(Message::Text(serialized.clone().into()));
        }
    }
}

fn serialize_event(event: &str, payload: Value) -> String {
    serde_json::to_string(&json!({
        "event": event,
        "payload": payload,
    }))
    .expect("No se pudo serializar el mensaje WebSocket")
}

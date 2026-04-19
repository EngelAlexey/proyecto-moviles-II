'use client';

import React, { ReactNode, useReducer } from 'react';
import type {
  DiceValues,
  DiceCombo,
  GameStatus,
  Player,
  Pair,
  RoomSummary,
} from '@dado-triple/shared-types';

export interface GameContextState {
  // Room state
  roomId: string | null;
  sessionId: string | null;
  activeRooms: RoomSummary[];

  // Game state
  players: Player[];
  pairs: Pair[];
  byePlayerId: string | null;
  currentDice: DiceValues | null;
  status: GameStatus;
  round: number;
  maxRounds: number;

  // Current player's last roll
  lastRollResult: {
    dice: DiceValues;
    combo: DiceCombo;
    score: number;
  } | null;

  // Game history/leaderboard
  gameHistory: {
    sessionId: string;
    finalScores: Record<string, number>;
    winnerId: string;
    createdAt: Date;
  }[];

  // Error state
  error: string | null;
}

export type GameAction =
  | { type: 'SET_ACTIVE_ROOMS'; payload: RoomSummary[] }
  | { type: 'CREATE_ROOM'; payload: { roomId: string; sessionId: string; room: RoomSummary } }
  | { type: 'JOIN_ROOM'; payload: { roomId: string; sessionId: string; room: RoomSummary; state: GameContextState } }
  | { type: 'SET_PLAYERS'; payload: Player[] }
  | { type: 'ADD_PLAYER'; payload: Player }
  | { type: 'REMOVE_PLAYER'; payload: string }
  | { type: 'SET_PAIRS'; payload: Pair[] }
  | { type: 'SET_CURRENT_DICE'; payload: { dice: DiceValues; combo: DiceCombo; score: number } }
  | { type: 'GAME_START' }
  | { type: 'ROUND_RESULT'; payload: { round: number } }
  | { type: 'GAME_OVER'; payload: { finalScores: Record<string, number>; winnerId: string } }
  | { type: 'UPDATE_GAME_STATE'; payload: Partial<GameContextState> }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'RESET_GAME' }
  | { type: 'SET_GAME_HISTORY'; payload: GameContextState['gameHistory'] };

const initialState: GameContextState = {
  roomId: null,
  sessionId: null,
  activeRooms: [],
  players: [],
  pairs: [],
  byePlayerId: null,
  currentDice: null,
  status: 'waiting',
  round: 0,
  maxRounds: 0,
  lastRollResult: null,
  gameHistory: [],
  error: null,
};

function gameReducer(state: GameContextState, action: GameAction): GameContextState {
  switch (action.type) {
    case 'SET_ACTIVE_ROOMS':
      return { ...state, activeRooms: action.payload };

    case 'CREATE_ROOM':
      return {
        ...state,
        roomId: action.payload.roomId,
        sessionId: action.payload.sessionId,
        activeRooms: [...state.activeRooms, action.payload.room],
        status: 'waiting',
        round: 0,
      };

    case 'JOIN_ROOM':
      return {
        ...state,
        roomId: action.payload.roomId,
        sessionId: action.payload.sessionId,
        players: action.payload.state.players,
        byePlayerId: action.payload.state.byePlayerId,
        status: action.payload.state.status,
        round: action.payload.state.round,
        maxRounds: action.payload.state.maxRounds,
      };

    case 'SET_PLAYERS':
      return { ...state, players: action.payload };

    case 'ADD_PLAYER': {
      const exists = state.players.some((p) => p.id === action.payload.id);
      return {
        ...state,
        players: exists ? state.players : [...state.players, action.payload],
      };
    }

    case 'REMOVE_PLAYER':
      return {
        ...state,
        players: state.players.filter((p) => p.id !== action.payload),
      };

    case 'SET_PAIRS':
      return { ...state, pairs: action.payload };

    case 'SET_CURRENT_DICE':
      return {
        ...state,
        lastRollResult: {
          dice: action.payload.dice,
          combo: action.payload.combo,
          score: action.payload.score,
        },
      };

    case 'GAME_START':
      return { ...state, status: 'playing', round: 1 };

    case 'ROUND_RESULT':
      return { ...state, round: action.payload.round, lastRollResult: null };

    case 'GAME_OVER': {
      const newHistory = [
        {
          sessionId: state.sessionId || 'unknown',
          finalScores: action.payload.finalScores,
          winnerId: action.payload.winnerId,
          createdAt: new Date(),
        },
        ...state.gameHistory,
      ];
      return {
        ...state,
        status: 'finished',
        gameHistory: newHistory,
      };
    }

    case 'UPDATE_GAME_STATE':
      return { ...state, ...action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload };

    case 'RESET_GAME':
      return {
        ...initialState,
        gameHistory: state.gameHistory,
      };

    case 'SET_GAME_HISTORY':
      return { ...state, gameHistory: action.payload };

    default:
      return state;
  }
}

export interface GameContextValue {
  state: GameContextState;
  dispatch: React.Dispatch<GameAction>;
}

export const GameContext = React.createContext<GameContextValue | null>(null);

export interface GameProviderProps {
  children: ReactNode;
}

export function GameProvider({ children }: GameProviderProps) {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  const value: GameContextValue = { state, dispatch };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGameContext() {
  const context = React.useContext(GameContext);
  if (!context) {
    throw new Error('useGameContext must be used within GameProvider');
  }
  return context;
}

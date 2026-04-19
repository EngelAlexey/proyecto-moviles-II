import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { GameScreen } from '../src/components/GameScreen';
import type { GameState, PairsAssignedPayload } from '@dado-triple/shared-types';

describe('GameScreen Component', () => {
  const mockOnRollDice = jest.fn();
  const baseState: GameState = {
    sessionId: 'session-1',
    players: [
      { id: 'p1', name: 'Alice', score: 15, isReady: true },
      { id: 'p2', name: 'Bob', score: 8, isReady: true },
    ],
    pairs: [{ player1Id: 'p1', player2Id: 'p2' }],
    byePlayerId: null,
    currentDice: [2, 4, 6],
    status: 'playing',
    round: 1,
    maxRounds: 5,
  };
  const basePairing: PairsAssignedPayload = {
    pairs: [{ player1Id: 'p1', player2Id: 'p2' }],
    bye: null,
    round: 1,
  };

  it('renders the "Lanzar Dados" button', () => {
    render(
      <GameScreen
        gameState={baseState}
        localPlayerId="p1"
        latestPairing={basePairing}
        onRollDice={mockOnRollDice}
      />
    );

    const rollButton = screen.getByText('Lanzar Dados');
    expect(rollButton).toBeTruthy();
  });

  it('disables the "Lanzar Dados" button when isReady is false', () => {
    const waitingState: GameState = {
      ...baseState,
      players: [
        { ...baseState.players[0], isReady: false },
        baseState.players[1],
      ],
      status: 'waiting',
    };

    render(
      <GameScreen
        gameState={waitingState}
        localPlayerId="p1"
        latestPairing={null}
        onRollDice={mockOnRollDice}
      />
    );

    const rollButton = screen.getByText('Lanzar Dados').parent;
    // Check for disabled prop or opacity/style that indicates disabled
    // In native-testing-library we can check for accessibilityState
    expect(rollButton).toHaveProperty('props.accessibilityState', { disabled: true });
    
    // Also try to press it and verify mock is not called
    fireEvent.press(screen.getByText('Lanzar Dados'));
    expect(mockOnRollDice).not.toHaveBeenCalled();
  });

  it('shows the opponent banner when the pair is available', () => {
    render(
      <GameScreen
        gameState={baseState}
        localPlayerId="p1"
        latestPairing={basePairing}
        onRollDice={mockOnRollDice}
      />
    );

    expect(screen.getByText('Oponente en ronda 1: Bob')).toBeTruthy();
  });

  it('enables the button and calls onRollDice when isReady is true', () => {
    render(
      <GameScreen
        gameState={baseState}
        localPlayerId="p1"
        latestPairing={basePairing}
        onRollDice={mockOnRollDice}
      />
    );

    const rollButton = screen.getByText('Lanzar Dados');
    fireEvent.press(rollButton);
    expect(mockOnRollDice).toHaveBeenCalledTimes(1);
  });

  it('shows the rest screen when the local player has bye', () => {
    render(
      <GameScreen
        gameState={{ ...baseState, byePlayerId: 'p1', pairs: [] }}
        localPlayerId="p1"
        latestPairing={{ pairs: [], bye: 'p1', round: 2 }}
        onRollDice={mockOnRollDice}
      />
    );

    expect(screen.getByText('Descanso')).toBeTruthy();
    expect(screen.getByText('Descanso. Esperando siguiente ronda.')).toBeTruthy();
    expect(screen.queryByText('Lanzar Dados')).toBeNull();
  });
});

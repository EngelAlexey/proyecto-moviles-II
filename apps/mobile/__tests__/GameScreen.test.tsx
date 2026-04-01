import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { GameScreen } from '../src/components/GameScreen';

describe('GameScreen Component', () => {
  const mockOnRollDice = jest.fn();

  it('renders the "Lanzar Dados" button', () => {
    render(
      <GameScreen 
        dice={null}
        score={null}
        isReady={true}
        onRollDice={mockOnRollDice}
      />
    );

    const rollButton = screen.getByText('Lanzar Dados');
    expect(rollButton).toBeTruthy();
  });

  it('disables the "Lanzar Dados" button when isReady is false', () => {
    render(
      <GameScreen 
        dice={null}
        score={null}
        isReady={false}
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

  it('shows "Espera tu turno..." message when isReady is false', () => {
    render(
      <GameScreen 
        dice={null}
        score={null}
        isReady={false}
        onRollDice={mockOnRollDice}
      />
    );

    expect(screen.getByText('Espera tu turno...')).toBeTruthy();
  });

  it('enables the button and calls onRollDice when isReady is true', () => {
    render(
      <GameScreen 
        dice={null}
        score={null}
        isReady={true}
        onRollDice={mockOnRollDice}
      />
    );

    const rollButton = screen.getByText('Lanzar Dados');
    fireEvent.press(rollButton);
    expect(mockOnRollDice).toHaveBeenCalledTimes(1);
  });
});

import { useGameContext } from '../context/game-context';

/**
 * Hook to access game state and dispatch
 */
export function useGameState() {
  const { state, dispatch } = useGameContext();

  return {
    state,
    dispatch,
  };
}

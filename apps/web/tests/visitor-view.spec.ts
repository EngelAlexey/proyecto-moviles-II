import { test, expect } from '@playwright/test';
import { SocketEvents, DiceValues } from '@dado-triple/shared-types';

test('visitor viewing the game in live', async ({ page }) => {
  // Mock socket.io-client before the page loads
  await page.addInitScript((events: any) => {
    (window as any).io = () => {
      const listeners: Record<string, Function[]> = {};
      return {
        on: (event: string, cb: Function) => {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(cb);
          
          // Simulate receiving a GameState update with status "playing" immediately
          if (event === events.GAME_UPDATE) {
            setTimeout(() => {
              cb({
                state: {
                  status: 'playing',
                  currentDice: [5, 5, 5],
                  players: [],
                  pairs: [],
                  round: 1
                }
              });
            }, 500);
          }

          // Simulate receiving a Dice Rolled event after a delay
          if (event === events.DICE_ROLLED) {
            setTimeout(() => {
              cb({
                playerId: 'player-1',
                dice: [6, 6, 6],
                score: 150
              });
            }, 1500);
          }
        },
        emit: () => {},
        close: () => {},
        removeListener: () => {},
        off: () => {},
      };
    };
  }, { GAME_UPDATE: SocketEvents.GAME_UPDATE, DICE_ROLLED: SocketEvents.DICE_ROLLED });

  // Navigate to the main page
  await page.goto('/');

  // Check title
  await expect(page.locator('h1')).toHaveText('Dado Triple');

  // Verify that after the mock DICE_ROLLED event, the score and dice are visible
  const scoreElement = page.locator('text=Puntos: 150');
  await expect(scoreElement).toBeVisible({ timeout: 10000 });

  // Verify dice values
  const diceElements = page.locator('div.bg-white.text-dark-900');
  await expect(diceElements).toHaveCount(3);
  await expect(diceElements.first()).toHaveText('6');

  // Check animation pulse (while waiting for dice)
  // Initially (before DICE_ROLLED), there should be 3 pulse divs
  // But our DICE_ROLLED happens at 1500ms, so we can check it
  console.log('Test completed successfully');
});

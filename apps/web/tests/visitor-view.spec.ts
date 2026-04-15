import { expect, test } from '@playwright/test';
import { SocketEvents } from '@dado-triple/shared-types';

test('visitor can list and observe a room in real time', async ({ page }) => {
  await page.addInitScript((events: any) => {
    (window as any).__DADO_REALTIME_CLIENT_FACTORY__ = (options: any) => {
      const listeners: Record<string, Array<(payload: unknown) => void>> = {};

      return {
        connect: () => {
          options.onOpen?.({ transport: 'websocket', connectionId: 'mock-1' });

          setTimeout(() => {
            listeners[events.ROOMS_LIST]?.forEach((cb) =>
              cb({
                rooms: [
                  {
                    roomId: 'room-alpha',
                    sessionId: 'session-1',
                    status: 'playing',
                    round: 1,
                    maxRounds: 5,
                    playerCount: 2,
                    observerCount: 1,
                    playerNames: ['Alice', 'Bob'],
                  },
                ],
              }),
            );
          }, 200);

          setTimeout(() => {
            listeners[events.GAME_UPDATE]?.forEach((cb) =>
              cb({
                state: {
                  status: 'playing',
                  currentDice: [5, 5, 5],
                  players: [],
                  pairs: [],
                  round: 1,
                  maxRounds: 5,
                  sessionId: 'session-1',
                },
              }),
            );
          }, 500);

          setTimeout(() => {
            listeners[events.DICE_ROLLED]?.forEach((cb) =>
              cb({
                playerId: 'player-1',
                dice: [6, 6, 6],
                combo: 'triple',
                score: 150,
              }),
            );
          }, 1000);
        },
        disconnect: () => {
          options.onClose?.({ transport: 'websocket', connectionId: null, reason: 'mock-close' });
        },
        getConnectionId: () => 'mock-1',
        on: (event: string, cb: (payload: unknown) => void) => {
          if (!listeners[event]) {
            listeners[event] = [];
          }

          listeners[event].push(cb);

          return () => {
            listeners[event] = listeners[event].filter((listener) => listener !== cb);
          };
        },
        send: () => {},
      };
    };
  }, {
    ROOMS_LIST: SocketEvents.ROOMS_LIST,
    GAME_UPDATE: SocketEvents.GAME_UPDATE,
    DICE_ROLLED: SocketEvents.DICE_ROLLED,
  });

  await page.goto('/');

  await expect(page.locator('h1')).toHaveText('Dado Triple - Web Observer Console');
  await expect(page.locator('text=SOCKET: CONECTADO')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('text=room-alpha')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('text=Jugadores: Alice, Bob')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('text=GAME_UPDATE: status=playing ronda=1 jugadores=0')).toBeVisible({
    timeout: 10000,
  });
  await expect(
    page.locator('text=DICE_ROLLED: [6,6,6] combo=triple score=150 (player: player-1)'),
  ).toBeVisible({
    timeout: 10000,
  });
});

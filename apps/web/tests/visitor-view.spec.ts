import { expect, test } from '@playwright/test';

test('visitor can connect to the distributed websocket server and auto-observe a created room', async ({
  page,
  browserName,
}) => {
  const roomId = `visitor-${browserName}-${Date.now()}`;

  await page.goto('/');

  await expect(page.locator('h1')).toContainText('Dado Triple');
  await expect(page.locator('text=ONLINE')).toBeVisible({ timeout: 15000 });

  await page.locator('input[placeholder="ID de conexión remota"]').fill(roomId);
  await page.getByRole('button', { name: /CREAR/i }).click();

  await expect(page.locator(`text=${roomId}`)).toBeVisible({ timeout: 15000 });
  await expect(page.locator(`text=ROOM_CREATED: ${roomId}`)).toBeVisible({ timeout: 15000 });
  await expect(
    page.locator(`text=-> JOIN_AS_OBSERVER emitido (sala: ${roomId})`),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.locator('text=GAME_UPDATE: status=waiting ronda=0 jugadores=0')).toBeVisible({
    timeout: 15000,
  });
});

import { expect, test } from '@playwright/test';

test('visitor can connect to the distributed websocket server and auto-observe a created room', async ({
  page,
  browserName,
}) => {
  const roomId = `visitor-${browserName}-${Date.now()}`;

  await page.goto('/');

  await expect(page.locator('h1')).toHaveText('Dado Triple - Web Observer Console');
  await expect(page.locator('text=URL activa: ws://18.218.158.112:5000')).toBeVisible({
    timeout: 15000,
  });
  await expect(page.locator('text=SOCKET: CONECTADO')).toBeVisible({ timeout: 15000 });

  await page.locator('input[placeholder="Codigo de sala"]').fill(roomId);
  await page.getByRole('button', { name: 'CREAR SALA (PRUEBA)' }).click();

  await expect(page.locator(`text=${roomId}`)).toBeVisible({ timeout: 15000 });
  await expect(page.locator(`text=ROOM_CREATED: ${roomId}`)).toBeVisible({ timeout: 15000 });
  await expect(
    page.locator(`text=-> JOIN_AS_OBSERVER emitido (sala: ${roomId})`),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.locator('text=GAME_UPDATE: status=waiting ronda=0 jugadores=0')).toBeVisible({
    timeout: 15000,
  });
});

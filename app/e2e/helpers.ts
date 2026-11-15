import { test as base, expect, type Page } from '@playwright/test';

// Network boundaries are intercepted. These tests never use the operator's real keys or spend API credit.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route(/https:\/\/(api\.kroger\.com|openrouter\.ai|mangisoz\.nu\.edu\.kz)\//, route => route.abort());
    await use(page);
  },
});
export { expect };

export const SAMPLE = '2 Barilla spaghetti 16 oz\nTide liquid detergent 64 loads';
export const KEYS = { mangisoz: 'ak_e2e_dummy_not_a_real_key', kroger: 'e2e-dummy-kroger-token', openrouter: 'e2e-dummy-openrouter-key' };

export async function navigate(page: Page, screen: string) {
  await page.evaluate(s => { location.hash = s; }, screen);
}

/** What Stripe's Payment Link does on success: sends the shopper back to `#plan?checkout=success`. */
export async function grantMembership(page: Page, period: 'year' | 'month' = 'year') {
  await navigate(page, `plan?checkout=success&period=${period}`);
  await expect(page.getByRole('heading', { name: /member/i })).toBeVisible();
  await expect.poll(async () => (await dbRows(page, 'app')).find(r => r.id === 'entitlement')?.member).toBe(true);
}

export async function setKey(page: Page, provider: keyof typeof KEYS) {
  await navigate(page, 'settings');
  const id = { mangisoz: 'k-mangisoz', kroger: 'k-kroger', openrouter: 'k-or' }[provider];
  await page.locator(`#${id}`).fill(KEYS[provider]);
  await page.locator(`#${id}`).blur();
}

export async function inputList(page: Page, text = SAMPLE) {
  await navigate(page, 'list');
  await page.getByLabel('Your grocery list', { exact: true }).fill(text);
  await page.getByRole('button', { name: /^Find cheaper options/ }).click();
  await expect(page).toHaveURL(/#store$/);
}

export async function finishConfirmation(page: Page) {
  await expect(page).toHaveURL(/#confirm$/);
  // Question is remounted per line, so wait for the previous answer to commit.
  for (let i = 0; i < 20; i++) {
    const review = page.getByRole('heading', { name: 'Is this what you usually buy?' });
    if (await review.isVisible()) break;
    const group = page.getByRole('radiogroup');
    await expect(group).toBeVisible();
    const question = await page.locator('.q-ctx').innerText();
    await group.getByRole('radio').first().click();
    await expect(page.locator('.q-ctx')).not.toHaveText(question);
  }
  await page.getByRole('button', { name: 'Find the cheaper basket', exact: true }).click();
  await expect(page).toHaveURL(/#result$/);
  await expect(page.locator('.cmp')).toBeVisible();
}

export async function makeBasket(page: Page, text = SAMPLE) {
  await page.goto('/');
  await inputList(page, text);
  await page.getByRole('button', { name: /Kroger · Downtown/ }).click();
  await finishConfirmation(page);
}

export async function shopping(page: Page) {
  await page.getByRole('button', { name: 'Get my shopping list', exact: true }).click();
  await expect(page).toHaveURL(/#shop$/);
}

export async function confirmPurchase(page: Page) {
  await page.getByRole('button', { name: /^(I shopped this|Update this week’s shop)$/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Confirm \d+ items?$/ }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
}

export async function dbRows(page: Page, store: string) {
  return page.evaluate(name => new Promise<any[]>((resolve, reject) => {
    const req = indexedDB.open('pro-groceries');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(name, 'readonly');
      const get = tx.objectStore(name).getAll();
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
      tx.oncomplete = () => db.close();
    };
  }), store);
}

export function cents(text: string) { return Math.round(Number(text.replace(/[^\d.]/g, '')) * 100); }

export function products(price = 1.25) {
  return [
    { productId: 'test-barilla', brand: 'Barilla', description: 'Barilla Spaghetti Pasta', categories: ['Pasta'], items: [{ itemId: 'i-barilla', size: '16 oz', price: { regular: 2.29 } }] },
    { productId: 'test-kroger', brand: 'Kroger', description: 'Kroger Spaghetti Pasta', categories: ['Pasta'], items: [{ itemId: 'i-kroger', size: '16 oz', price: { regular: price } }] },
  ];
}

export async function mockKroger(page: Page, options: { price?: () => number; status?: () => number; missingPrice?: boolean } = {}) {
  await page.route('https://api.kroger.com/v1/**', async route => {
    const url = new URL(route.request().url());
    const status = options.status?.() ?? 200;
    if (status !== 200) return route.fulfill({ status, json: { error: 'Test provider failure' } });
    if (url.pathname.endsWith('/locations')) return route.fulfill({ json: { data: [
      { locationId: 'test-downtown', chain: 'KROGER', name: 'Test Kroger Downtown', address: { city: 'Cincinnati', state: 'OH', addressLine1: '1 Test St' } },
      { locationId: 'test-other', chain: 'KROGER', name: 'Test Kroger Other', address: { city: 'Cincinnati', state: 'OH' } },
    ] } });
    const data = products(options.price?.() ?? 1.25);
    if (options.missingPrice) data.forEach(p => { delete (p.items[0] as { price?: unknown }).price; });
    return route.fulfill({ json: { data } });
  });
}

export async function liveFixtureBasket(page: Page, options: Parameters<typeof mockKroger>[1] = {}) {
  await page.goto('/');
  await mockKroger(page, options);
  await setKey(page, 'kroger');
  await inputList(page, '2 Barilla spaghetti 16 oz');
  await page.getByRole('button', { name: /Test Kroger Downtown/ }).click();
  await finishConfirmation(page);
}

export async function fakeRecorder(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }),
    } });
    class Recorder {
      static isTypeSupported() { return true; }
      state = 'inactive';
      mimeType = 'audio/webm';
      ondataavailable: any;
      onstop: any;
      constructor(public stream: any) {}
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob([new Uint8Array(3000)], { type: this.mimeType }) });
        this.onstop?.();
      }
    }
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: Recorder });
  });
}

export async function dictate(page: Page, buttonName: string | RegExp) {
  await page.getByRole('button', { name: buttonName }).click();
  await page.getByRole('button', { name: /^Stop ·/ }).click();
}

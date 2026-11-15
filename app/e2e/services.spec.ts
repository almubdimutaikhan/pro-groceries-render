import { test, expect, cents, dbRows, navigate, inputList, finishConfirmation, liveFixtureBasket, makeBasket, mockKroger, setKey, KEYS, fakeRecorder, dictate, shopping, confirmPurchase } from './helpers';

test('ZIP: an invalid ZIP is rejected and the stores stay usable', async ({ page }) => {
  await page.goto('/');
  await inputList(page);
  await page.getByLabel('ZIP code', { exact: true }).fill('12');
  await page.getByRole('button', { name: 'Find stores', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter a 5-digit US ZIP code.');
  await expect(page.locator('.market')).toContainText('Pilot market: Cincinnati, Ohio');
  await expect(page.getByRole('button', { name: 'Use my location' })).toHaveCount(0);
  await page.getByRole('button', { name: /Kroger · Downtown/ }).click();
  await finishConfirmation(page);
});
test('Kroger contract (mocked): scoped prices, deterministic totals, fresh repricing and no credential storage', async ({ page }) => {
  let price = 1.25;
  const requests: Array<{ url: string; auth: string | undefined }> = [];
  page.on('request', r => { if (r.url().startsWith('https://api.kroger.com/')) requests.push({ url: r.url(), auth: r.headers().authorization }); });
  await liveFixtureBasket(page, { price: () => price });
  await expect(page.locator('.cmp')).toContainText('$4.58');
  await expect(page.locator('.cmp')).toContainText('$2.50');
  await expect(page.locator('.hero-save h1')).toHaveText('$2.08 less');
  const observations = await dbRows(page, 'priceObservations');
  expect(observations.length).toBeGreaterThan(0);
  expect(observations.every(p => p.storeId === 'test-downtown' && p.source === 'kroger' && p.fetchedAt)).toBeTruthy();
  const beforeRequests = requests.filter(r => r.url.includes('/products?')).length;
  price = 1.50;
  await navigate(page, 'home');
  await page.getByRole('button', { name: 'Re-price my basket', exact: true }).click();
  await expect(page.locator('.hero-save h1')).toHaveText('$1.58 less');
  expect(requests.filter(r => r.url.includes('/products?')).length).toBeGreaterThan(beforeRequests);
  expect(requests.every(r => r.auth === `Bearer ${KEYS.kroger}`)).toBeTruthy();
  await expect(page.locator('.demo-note')).toHaveCount(0);   // live comparison: no "Demo prices" label
  const branchIds = requests.filter(r => r.url.includes('/products?')).map(r => new URL(r.url).searchParams.get('filter.locationId'));
  expect(branchIds).toContain('test-downtown');
  expect(branchIds.every(id => ['test-downtown', 'test-other'].includes(id!))).toBeTruthy();
  expect(await dbRows(page, 'shoppingEvents')).toHaveLength(0);
  expect(JSON.stringify(await dbRows(page, 'app'))).not.toContain(KEYS.kroger);
  await page.reload();
  await navigate(page, 'settings');
  await expect(page.locator('#k-kroger')).toHaveValue('');
});

test('Kroger contract (mocked): a repeat lookup within 15 minutes comes from the cache, a re-price does not', async ({ page }) => {
  const products: string[] = [];
  page.on('request', r => { if (r.url().startsWith('https://api.kroger.com/') && r.url().includes('/products?')) products.push(r.url()); });
  await liveFixtureBasket(page);
  const built = products.length;
  expect(built).toBeGreaterThan(0);
  expect(built, 'one search is enough: the branded search already returned a store-brand product').toBe(1);
  await navigate(page, 'store');
  await page.getByRole('button', { name: /Test Kroger Downtown/ }).click();
  await finishConfirmation(page);
  expect(products.length, 'same store, same list: served from the cache').toBe(built);
  await navigate(page, 'home');
  await page.getByRole('button', { name: /^Re-price my basket/ }).click();
  await expect(page).toHaveURL(/#result$/);
  expect(products.length, 'an explicit re-price always fetches').toBeGreaterThan(built);
});

test('Kroger contract (mocked): store comparison is offered with live prices and fetches only when asked', async ({ page }) => {
  const stores: string[] = [];
  page.on('request', r => {
    if (r.url().startsWith('https://api.kroger.com/') && r.url().includes('/products?')) stores.push(new URL(r.url()).searchParams.get('filter.locationId')!);
  });
  await liveFixtureBasket(page);
  await expect(page.getByRole('button', { name: /Compare nearby Kroger stores/ })).toBeVisible();
  expect(stores.every(id => id === 'test-downtown'), 'opening the result checks only your own store').toBeTruthy();
  await page.getByRole('button', { name: /Compare nearby Kroger stores/ }).click();
  await expect(page).toHaveURL(/#compare$/);
  expect(stores.every(id => id === 'test-downtown'), 'opening the comparison screen still fetches nothing').toBeTruthy();
  await page.getByRole('button', { name: /^Check 1 nearby Kroger store/ }).click();
  await expect(page.locator('.store-quotes')).toContainText('Test Kroger Other');
  expect(stores).toContain('test-other');
  await expect(page.locator('body')).not.toContainText(/walmart|aldi|target|split/i);
});

test('Kroger contract (mocked): choosing another store fetches with the new branch ID', async ({ page }) => {
  await liveFixtureBasket(page);
  await navigate(page, 'store');
  await page.getByRole('button', { name: /Test Kroger Other/ }).click();
  await finishConfirmation(page);
  await expect(page.locator('.hero-save')).toContainText('Test Kroger Other');
  const c = (await dbRows(page, 'comparisons')).find(c => c.storeId === 'test-other');
  expect(c).toBeTruthy();
});

for (const status of [401, 503]) {
  test(`Kroger contract (mocked): HTTP ${status} keeps prior comparison, never falls back to fixture prices`, async ({ page }) => {
    let responseStatus = 200;
    await liveFixtureBasket(page, { status: () => responseStatus });
    const prior = await dbRows(page, 'comparisons');
    responseStatus = status;
    await navigate(page, 'home');
    await page.getByRole('button', { name: 'Re-price my basket', exact: true }).click();
    await expect(page.locator('.toasts')).toContainText(status === 401 ? 'token expired' : 'HTTP 503');
    await expect(page).toHaveURL(/#home$/);
    expect(await dbRows(page, 'comparisons')).toEqual(prior);
  });
}

test('Kroger contract (mocked): missing prices are excluded instead of becoming zero-price swaps', async ({ page }) => {
  await liveFixtureBasket(page, { missingPrice: true });
  await expect(page.getByRole('heading', { name: 'No cheaper swaps right now' })).toBeVisible();
  await expect(page.locator('.coverage')).toContainText('0 of 1 items priced');
  await expect(page.locator('.muted-block')).toContainText('unpriced or not found');
});

test('OpenRouter contract (mocked): parses structured lines and still obtains prices from retailer', async ({ page }) => {
  await page.goto('/');
  let request: Record<string, any> | undefined;
  await page.route('https://openrouter.ai/api/v1/chat/completions', route => {
    request = route.request().postDataJSON();
    return route.fulfill({ json: { choices: [{ message: { content: JSON.stringify({ items: [{ text: '2 Barilla spaghetti 16 oz', brand: 'Barilla', product: 'spaghetti', variants: [], count: 2, size: '16 oz' }] }) } }] } });
  });
  await setKey(page, 'openrouter');
  await inputList(page, '2 Barilla spaghetti 16 oz');
  expect(request?.response_format.type).toBe('json_schema');
  await page.getByRole('button', { name: /Kroger · Downtown/ }).click();
  await finishConfirmation(page);
  expect(cents(await page.locator('.hero-save h1').innerText())).toBeGreaterThan(0);
  expect(JSON.stringify(await dbRows(page, 'app'))).not.toContain(KEYS.openrouter);
});

test('OpenRouter contract (mocked): malformed response falls back to editable local parsing', async ({ page }) => {
  await page.goto('/');
  await page.route('https://openrouter.ai/api/v1/chat/completions', route => route.fulfill({ json: { choices: [{ message: { content: 'not json' } }] } }));
  await setKey(page, 'openrouter');
  await inputList(page, '2 Barilla spaghetti 16 oz');
  await page.getByRole('button', { name: /Kroger · Downtown/ }).click();
  await finishConfirmation(page);
  await expect(page.locator('.coverage')).toContainText('1 of 1 items priced');
});

test('MangiSoz OCR contract (mocked): photo list is editable before pricing', async ({ page }) => {
  await page.goto('/');
  await setKey(page, 'mangisoz');
  let auth = '';
  await page.route('https://mangisoz.nu.edu.kz/backend/api/v1/ocr/image', route => {
    auth = route.request().headers()['x-api-key'];
    expect(route.request().postData()).toContain('name="file"');
    return route.fulfill({ json: { data: { text: 'BARILLA SPAGHETTI 16OZ 2.29\nTOTAL 2.29' } } });
  });
  await navigate(page, 'list');
  await page.locator('input[type=file]').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: Buffer.from('test image bytes') });
  await expect(page.getByLabel('Your grocery list', { exact: true })).toHaveValue(/BARILLA SPAGHETTI 16 oz/i);
  expect(auth).toBe(KEYS.mangisoz);
  expect(await dbRows(page, 'comparisons')).toHaveLength(0);
  await expect(page.getByLabel('Your grocery list', { exact: true })).toBeEditable();
});

test('MangiSoz OCR contract (mocked): receipt marking needs confirmation and counts only matched purchased lines', async ({ page }) => {
  await makeBasket(page);
  await setKey(page, 'mangisoz');
  await page.route('https://mangisoz.nu.edu.kz/backend/api/v1/ocr/image', route => route.fulfill({ json: { data: { text: 'KROGER SPAGHETTI PASTA 16 OZ 1.25' } } }));
  await navigate(page, 'shop');
  await page.locator('input[type=file]').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: Buffer.from('test image bytes') });
  await expect(page.getByRole('dialog', { name: 'Found on your receipt' })).toBeVisible();
  expect(await dbRows(page, 'shoppingEvents')).toHaveLength(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm 1 item', exact: true }).click();
  await expect.poll(async () => (await dbRows(page, 'shoppingEvents')).length).toBe(1);
  const event = (await dbRows(page, 'shoppingEvents'))[0];
  expect(event.source).toBe('receipt');
  expect(event.purchasedLineIds).toHaveLength(1);
});

test('MangiSoz STT contract (mocked): dictation creates editable text and locks an exact result item', async ({ page }) => {
  await fakeRecorder(page);
  await page.goto('/');
  await setKey(page, 'mangisoz');
  let transcript = '2 Barilla spaghetti 16 oz\nTide liquid detergent 64 loads';
  await page.route('https://mangisoz.nu.edu.kz/backend/api/v1/stt/audio/transcriptions', route => {
    expect(route.request().headers().authorization).toBe(`Bearer ${KEYS.mangisoz}`);
    expect(route.request().postData()).toContain('name="file"');
    return route.fulfill({ json: { text: transcript } });
  });
  await navigate(page, 'list');
  await dictate(page, 'Say it');
  await expect(page.getByLabel('Your grocery list', { exact: true })).toHaveValue(transcript);
  await page.getByRole('button', { name: /^Find cheaper options/ }).click();
  await page.getByRole('button', { name: /Kroger · Downtown/ }).click();
  await finishConfirmation(page);
  transcript = 'keep my Tide';
  await dictate(page, 'Say “keep my Tide”');
  await expect(page.getByRole('heading', { name: 'Kept yours' })).toBeVisible();
  const prior = await page.locator('.cmp').textContent();
  transcript = 'do something unclear';
  await dictate(page, 'Say “keep my Tide”');
  await expect(page.locator('.toasts')).toContainText('Try');
  await expect(page.locator('.cmp')).toHaveText(prior!);
  await shopping(page);
  transcript = 'got spaghetti';
  await dictate(page, 'Say “got milk and eggs”');
  await expect(page.locator('.checklist input:checked')).toHaveCount(1);
  expect(await dbRows(page, 'shoppingEvents')).toHaveLength(0);
  await confirmPurchase(page);
});

test('MangiSoz TTS contract (mocked): read aloud sends the displayed computed saving', async ({ page }) => {
  await page.addInitScript(() => {
    class AudioStub { onended: any; async play() {} pause() {} }
    Object.defineProperty(window, 'Audio', { value: AudioStub });
  });
  await makeBasket(page);
  await setKey(page, 'mangisoz');
  await navigate(page, 'result');
  let spoken = '';
  await page.route('https://mangisoz.nu.edu.kz/backend/api/v1/tts/audio', route => {
    expect(route.request().headers()['x-api-key']).toBe(KEYS.mangisoz);
    spoken = new URLSearchParams(route.request().postData()!).get('text')!;
    return route.fulfill({ contentType: 'audio/wav', body: Buffer.alloc(44) });
  });
  await page.getByRole('button', { name: 'Read aloud', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
  expect(spoken).toContain('demo prices');
  expect(spoken).toContain('Estimate before tax');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Read aloud', exact: true })).toBeVisible();
});

test('MangiSoz errors (mocked): OCR rejection stays visible and text input remains usable', async ({ page }) => {
  await page.goto('/');
  await setKey(page, 'mangisoz');
  await page.route('https://mangisoz.nu.edu.kz/backend/api/v1/ocr/image', route => route.fulfill({ status: 401, json: {} }));
  await navigate(page, 'list');
  await page.locator('input[type=file]').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: Buffer.from('test image bytes') });
  await expect(page.locator('.toasts')).toContainText("Photo reading isn't available right now. Type your list instead.");
  await expect(page.locator('.toasts')).not.toContainText(/key|MangiSoz/i);
  await page.getByLabel('Your grocery list', { exact: true }).fill('Barilla spaghetti 16 oz');
  await expect(page.getByRole('button', { name: /^Find cheaper options/ })).toBeEnabled();
});

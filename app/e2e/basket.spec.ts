import { readFile } from 'node:fs/promises';
import { test, expect, cents, dbRows, navigate, inputList, makeBasket, shopping, confirmPurchase, finishConfirmation, grantMembership } from './helpers';

test('F01: parses a list, identifies fresh/unsupported items, and removes a line', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^(Check my basket|Paste my list)$/ }).first().click();
  await expect(page.getByRole('button', { name: 'Add a few items' })).toBeDisabled();
  await page.getByLabel('Your grocery list', { exact: true }).fill('2 Barilla spaghetti 16oz, Tide 64 loads, milk, chicken breast 2 lb, aspirin');
  await expect(page.getByRole('heading', { name: 'We read 5 items' })).toBeVisible();
  await expect(page.locator('.parsed-list')).toContainText('kept as is');
  await expect(page.locator('.parsed-list')).toContainText('not supported');
  await page.getByRole('button', { name: 'Remove aspirin', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'We read 4 items' })).toBeVisible();
});

test('F01–F05: sample basket completes without an account and labels fixture prices', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^(Try a sample basket|Try the example basket)$/ }).first().click();
  await page.getByRole('button', { name: /Kroger · Downtown/ }).click();
  await finishConfirmation(page);
  await expect(page.locator('.hero-save')).toContainText('demo prices');
  await expect(page.locator('.coverage')).toContainText('15');
  await expect(page.locator('.swaps .swap')).not.toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Fresh, kept as is' })).toBeVisible();
});

test('F03: ambiguous milk requires a shopper choice', async ({ page }) => {
  await page.goto('/');
  await inputList(page, 'milk');
  await page.getByRole('button', { name: /Kroger · Downtown/ }).click();
  await expect(page.getByRole('radiogroup', { name: 'Options for milk' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Find the cheaper basket', exact: true })).not.toBeVisible();
  await page.getByRole('radio').first().click();
  await expect(page.getByRole('heading', { name: 'Is this what you usually buy?' })).toBeVisible();
});

test('F03: unmatched and unsupported products remain visible outside totals', async ({ page }) => {
  await makeBasket(page, 'Barilla spaghetti 16 oz\nunicorn dinner dust\naspirin');
  await expect(page.getByRole('heading', { name: 'Not in the totals' })).toBeVisible();
  await expect(page.locator('.muted-block')).toContainText('unicorn dinner dust');
  await expect(page.locator('.muted-block')).toContainText('not supported');
  await expect(page.locator('.coverage')).toContainText('1 of 2 items priced');
});

test('F05: Keep original changes totals by exactly that swap and can be undone', async ({ page }) => {
  await makeBasket(page);
  const before = cents(await page.locator('.hero-save h1').innerText());
  const first = page.locator('.swap').first();
  const delta = cents(await first.locator('.sb-chip--save').innerText());
  await first.getByRole('button', { name: 'Keep original' }).click();
  await expect.poll(async () => cents(await page.locator('.hero-save h1').innerText())).toBe(before - delta);
  await expect(page.getByRole('heading', { name: 'Kept yours' })).toBeVisible();
  await page.getByRole('button', { name: 'Swap', exact: true }).click();
  await expect.poll(async () => cents(await page.locator('.hero-save h1').innerText())).toBe(before);
});

test('F06: partial shopping needs confirmation and duplicate purchases never inflate savings', async ({ page }) => {
  await makeBasket(page);
  await shopping(page);
  await page.locator('.checklist .check-row').first().click();
  await expect(page.locator('.checklist input').first()).toBeChecked();
  expect(await dbRows(page, 'shoppingEvents')).toHaveLength(0);
  await confirmPurchase(page);
  const events = await dbRows(page, 'shoppingEvents');
  expect(events).toHaveLength(1);
  expect(events[0].purchasedLineIds).toHaveLength(1);
  expect(events[0].savingCents).toBeGreaterThan(0);
  await confirmPurchase(page);
  expect(await dbRows(page, 'shoppingEvents')).toEqual(events.map(e => expect.objectContaining({ id: e.id, savingCents: e.savingCents })));
});

test('F06/16: saved locks survive reload and editing/repricing creates a new basket version', async ({ page }) => {
  await makeBasket(page);
  await page.locator('.swap').first().getByRole('button', { name: 'Keep original' }).click();
  const saved = await page.locator('.cmp').textContent();
  await expect.poll(async () => (await dbRows(page, 'app'))[0]?.locks.length).toBe(1);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your usual basket', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Re-price my basket', exact: true }).click();
  await expect(page.locator('.cmp')).toHaveText(saved!);
  await expect(page.getByRole('heading', { name: 'Kept yours' })).toBeVisible();
  expect(await dbRows(page, 'shoppingEvents')).toHaveLength(0);
  await navigate(page, 'list');
  await page.getByLabel('Your grocery list', { exact: true }).fill('2 Barilla spaghetti 16 oz');
  await page.getByRole('button', { name: /^Find cheaper options/ }).click();
  await page.getByRole('button', { name: /Kroger · Downtown/ }).click();
  await finishConfirmation(page);
  const versions = await dbRows(page, 'basketVersions');
  expect(versions.length).toBeGreaterThanOrEqual(3);
  expect(versions.at(-1).lines).toHaveLength(1);
});

test('brand preferences prevent swaps after repricing', async ({ page }) => {
  await makeBasket(page, '2 Barilla spaghetti 16 oz');
  await navigate(page, 'settings');
  await page.getByLabel('Brand', { exact: true }).fill('Barilla');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await navigate(page, 'home');
  await page.getByRole('button', { name: 'Re-price my basket', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No cheaper swaps right now' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Kept yours' })).toBeVisible();
});

test('reports count confirmed shopping, not price checks, and allow selecting a week', async ({ page }) => {
  await makeBasket(page);
  await grantMembership(page);
  await navigate(page, 'report');
  await expect(page.getByText(/Nothing marked this week/)).toBeVisible();
  await navigate(page, 'shop');
  await confirmPurchase(page);
  await navigate(page, 'report');
  await expect(page.locator('.counter')).toContainText('1 week');
  await expect(page.locator('.week-card .stats')).toContainText('Saved');
  const weeks = page.getByRole('button', { name: /^Week of .*spent/ });
  await expect(weeks).toHaveCount(8);
  await weeks.first().click();
  await expect(page.getByText(/Nothing marked this week/)).toBeVisible();
  await weeks.last().click();
  await expect(page.locator('.week-card .stats')).toContainText('Saved');
});

test('data export, clear and import restore local history', async ({ page }) => {
  await makeBasket(page);
  await shopping(page);
  await confirmPurchase(page);
  await navigate(page, 'settings');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export history', exact: true }).click();
  const download = await downloadPromise;
  const file = await download.path();
  const content = await readFile(file!, 'utf8');
  expect(JSON.parse(content).data.shoppingEvents).toHaveLength(1);
  await page.getByRole('button', { name: 'Clear my data', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, clear it', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Same groceries/ })).toBeVisible();
  expect(await dbRows(page, 'shoppingEvents')).toHaveLength(0);
  await navigate(page, 'settings');
  await page.locator('input[type=file]').setInputFiles({ name: 'history.json', mimeType: 'application/json', buffer: Buffer.from(content) });
  await expect.poll(async () => (await dbRows(page, 'shoppingEvents')).length).toBe(1);
  await navigate(page, 'home');
  await expect(page.getByRole('heading', { name: 'Your usual basket', exact: true })).toBeVisible();
});

test('missing payment configuration never pretends checkout succeeded', async ({ page }) => {
  await page.goto('/#plan');
  await expect(page.getByRole('button', { name: 'Checkout opens in the live demo' })).toBeDisabled();
  await expect(page.getByText('Test mode: no real charge')).toBeVisible();
  await expect(page.getByText(/Multiple saved baskets/)).toHaveCount(0);
  expect((await dbRows(page, 'app')).find(r => r.id === 'entitlement')?.member ?? false).toBe(false);
});

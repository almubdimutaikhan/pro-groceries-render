import { test, expect, dbRows, navigate, inputList, makeBasket, setKey, grantMembership, shopping } from './helpers';

const OTHER_CHAINS = /walmart|aldi|target/i;
const text = (page: import('@playwright/test').Page) => page.evaluate(() => document.body.textContent ?? '');

test.describe('one chain, one honest price source', () => {
  test('demo mode never mentions or prices Walmart, Aldi or Target, and has no split basket', async ({ page }) => {
    await page.goto('/');
    expect(await text(page)).not.toMatch(OTHER_CHAINS);
    expect(await text(page)).not.toMatch(/split/i);
    await page.getByRole('button', { name: /^(Try a sample basket|Try the example basket)$/ }).first().click();
    expect(await text(page)).not.toMatch(OTHER_CHAINS);
    await expect(page.locator('.stores .store-card')).toHaveCount(3);
    await page.getByRole('button', { name: /Kroger · Downtown/ }).click();
    await expect(page).toHaveURL(/#confirm$/);
    await page.getByRole('button', { name: 'Find the cheaper basket', exact: true }).click();
    await expect(page.locator('.cmp')).toBeVisible();
    expect(await text(page)).not.toMatch(OTHER_CHAINS);
    expect(await text(page)).not.toMatch(/split/i);
    // No store comparison offer in demo mode, and the screen says why.
    await expect(page.getByText(/Compare nearby Kroger stores/)).toHaveCount(0);
    await navigate(page, 'compare');
    await expect(page.getByRole('heading', { name: 'Store comparison needs live prices' })).toBeVisible();
  });

  test('the demo label follows the comparison, and the landing example is labelled next to itself', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.lx-caption')).toContainText('Example with demo prices');
    await makeBasket(page);
    await expect(page.locator('.coverage .demo-note')).toBeVisible();
  });
});

test.describe('voice and photo never lead a shopper to an API key', () => {
  test('without a MangiSoz key there are no voice or photo controls, and read aloud still works', async ({ page }) => {
    await page.goto('/#list');
    await expect(page.getByLabel('Your grocery list', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Say it/ })).toHaveCount(0);
    await expect(page.getByText('Snap a receipt')).toHaveCount(0);
    await makeBasket(page);
    await expect(page.getByRole('button', { name: /^Say “/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Read aloud', exact: true })).toBeVisible();   // browser voice
    await shopping(page);
    await expect(page.getByText('Scan your receipt')).toHaveCount(0);
  });

  test('with the key (operator setup) the controls appear', async ({ page }) => {
    await page.goto('/');
    await setKey(page, 'mangisoz');
    await navigate(page, 'list');
    await expect(page.getByRole('button', { name: /^Say it/ })).toBeVisible();
    await expect(page.getByText('Snap a receipt')).toBeVisible();
  });

  test('shoppers see no key fields in Settings; operator mode does', async ({ page }) => {
    await page.goto('/?operator=0#settings');
    await expect(page.getByRole('heading', { name: 'Never swap these brands' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your data' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
    for (const id of ['k-kroger', 'k-mangisoz', 'k-or', 'k-model']) await expect(page.locator(`#${id}`)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Operator setup/ })).toHaveCount(0);
    expect(await text(page)).not.toMatch(/MangiSoz|OpenRouter|access token/i);
    await page.goto('/?operator=1#settings');
    await expect(page.getByRole('heading', { name: /Operator setup/ })).toBeVisible();
    for (const id of ['k-kroger', 'k-mangisoz', 'k-or', 'k-model']) await expect(page.locator(`#${id}`)).toHaveCount(1);
  });
});

test.describe('membership: pay for what is really there', () => {
  test('after the one free re-pricing a card with the price replaces the button, and membership brings it back', async ({ page }) => {
    await makeBasket(page);
    await navigate(page, 'home');
    await expect(page.getByText('Your first re-pricing is free')).toBeVisible();
    await page.getByRole('button', { name: 'Re-price my basket', exact: true }).click();
    await expect(page).toHaveURL(/#result$/);
    await expect.poll(async () => (await dbRows(page, 'app')).find(r => r.id === 'entitlement')?.freeRepricesUsed).toBe(1);
    await navigate(page, 'home');
    await expect(page.getByRole('button', { name: 'Re-price my basket', exact: true })).toHaveCount(0);
    const card = page.getByRole('region', { name: "You've used your free re-pricing" });
    await expect(card).toBeVisible();
    await expect(card).toContainText('$49/year');
    await expect(card).toContainText('$5.99/month');
    await card.getByRole('button', { name: 'See membership' }).click();
    await expect(page).toHaveURL(/#plan$/);
    await grantMembership(page);
    await navigate(page, 'home');
    await expect(page.getByRole('button', { name: 'Re-price my basket', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Re-price my basket', exact: true }).click();
    await expect(page).toHaveURL(/#result$/);
    await navigate(page, 'home');
    await expect(page.getByRole('button', { name: 'Re-price my basket', exact: true })).toBeVisible();   // members: no limit
  });

  test('the weekly report and the savings counter are member features, with a locked preview for everyone else', async ({ page }) => {
    await makeBasket(page);
    await shopping(page);
    await expect(page.getByRole('region', { name: 'Savings counter is for members' })).toBeVisible();
    await navigate(page, 'report');
    await expect(page.getByRole('region', { name: 'The weekly report is for members' })).toBeVisible();
    await expect(page.locator('.locked-preview')).toHaveCount(1);
    await expect(page.getByRole('button', { name: /^Week of .*spent/ })).toHaveCount(0);
    await grantMembership(page);
    await navigate(page, 'report');
    await expect(page.locator('.locked-preview')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Week of .*spent/ })).toHaveCount(8);
    await expect(page.getByRole('heading', { name: 'Price watch' })).toBeVisible();
  });

  test('returning from Stripe unlocks membership once, and a reload does not repeat it', async ({ page }) => {
    await page.goto('/#plan?checkout=success');
    await expect(page.getByRole('heading', { name: 'Welcome, member.' })).toBeVisible();
    await expect(page).toHaveURL(/#plan$/);
    expect(await dbRows(page, 'app')).toContainEqual(expect.objectContaining({ id: 'entitlement', member: true, period: 'year' }));
    await page.reload();
    await expect(page.getByRole('heading', { name: 'You are a member.' })).toBeVisible();
    await expect(page.getByText('Test mode: no real charge')).toHaveCount(0);   // nothing left to buy
  });

  test('prices and the guarantee are the same everywhere', async ({ page }) => {
    await page.goto('/#plan');
    await expect(page.locator('.plan-card.on')).toContainText('$49.00');
    await expect(page.locator('.plan-options')).toContainText('$5.99');
    await expect(page.locator('.guarantee')).toContainText('Save 5× your membership or get your money back');
    await page.goto('/');
    expect(await text(page)).toContain('$49/year');
    expect(await text(page)).not.toMatch(/\$3\.99/);
  });

  test('clearing my data keeps the membership', async ({ page }) => {
    await page.goto('/');
    await grantMembership(page);
    await navigate(page, 'settings');
    await page.getByRole('button', { name: 'Clear my data', exact: true }).click();
    await page.getByRole('button', { name: 'Yes, clear it', exact: true }).click();
    await page.reload();
    await expect.poll(async () => (await dbRows(page, 'app')).find(r => r.id === 'entitlement')?.member).toBe(true);
  });

  test('example history is an operator tool', async ({ page }) => {
    await page.goto('/');
    await grantMembership(page);
    await page.goto('/?operator=0#report');
    await expect(page.getByRole('heading', { name: 'Price watch' })).toBeVisible();
    await expect(page.getByRole('button', { name: /example history/ })).toHaveCount(0);
    await page.goto('/?operator=1#report');
    await expect(page.getByRole('button', { name: 'Show 6 weeks of example history' })).toBeVisible();
  });
});

test.describe('trust and accessibility', () => {
  test('Price details show store, product ID, prices, time and source for both sides of a swap', async ({ page }) => {
    await makeBasket(page);
    const swap = page.locator('.swap').first();
    await expect(swap.locator('.swap-side.usual')).toContainText('Your usual');
    await expect(swap.locator('.swap-side.rec')).toContainText('Recommended');
    await expect(swap.locator('.swap-side.rec')).toContainText(/\d × .*(oz|loads|rolls|gal|ct)/);   // packages and size
    await expect(swap.getByRole('button', { name: 'Keep original' })).toBeVisible();
    await expect(swap.locator('.sb-chip--save')).toBeVisible();
    await swap.getByText('Price details', { exact: true }).click();
    const d = swap.locator('.price-details');
    await expect(d).toContainText('Store');
    await expect(d).toContainText(/Product ID\s*d-/);
    await expect(d).toContainText('Regular price');
    await expect(d).toContainText('Sale price');
    await expect(d).toContainText('Price fetched');
    await expect(d).toContainText('Demo catalog');
    await expect(d.locator('dt.pd-head')).toHaveText(['Your usual', 'Recommended']);
  });

  test('the Sheet is a real modal: focus moves in and stays in, Escape closes and focus returns', async ({ page }) => {
    await makeBasket(page);
    await shopping(page);
    const opener = page.getByRole('button', { name: 'I shopped this' });
    await opener.focus();
    await opener.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(':focus')).toHaveCount(1);
    for (let i = 0; i < 30; i++) await page.keyboard.press('Tab');
    await expect(dialog.locator(':focus')).toHaveCount(1);
    for (let i = 0; i < 31; i++) await page.keyboard.press('Shift+Tab');
    await expect(dialog.locator(':focus')).toHaveCount(1);
    await expect(page.locator('#root')).toHaveAttribute('inert', '');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('#root')).not.toHaveAttribute('inert', '');
    await expect(opener).toBeFocused();
  });

  test('opening a screen moves focus to its heading', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^(Check my basket|Paste my list)$/ }).first().click();
    await expect(page.getByRole('heading', { name: /usual basket/ })).toBeFocused();
    await inputList(page);
    await expect(page.getByRole('heading', { name: 'Where do you usually shop?' })).toBeFocused();
  });
});

test.describe('landing copy', () => {
  test('feature list uses names, not codes, and the claims match the product', async ({ page }) => {
    await page.goto('/');
    const features = page.locator('#features');
    await expect(features).not.toContainText(/\bF0\d\b/);
    for (const name of ['Paste or type your list', 'Same-basket swaps', 'Keep original', 'Prices from your store', 'Shopping checklist', 'Re-price every week', 'Savings you can check']) {
      await expect(features).toContainText(name);
    }
    await expect(page.locator('.rules-receipt')).toContainText('Lower price at checkout');
    await expect(page.locator('.rules-receipt')).not.toContainText('till');
    await expect(page.locator('.hero-copy .eyebrow')).toHaveText('For US households · Kroger-family stores');
    await expect(page.getByText(/Say it|Snap receipt/)).toHaveCount(0);   // no key: voice and photo are not promised
  });
});

import { test, expect, navigate, makeBasket } from './helpers';

// These assert requirements from SYSTEM.md. Features the app does not have are marked test.fixme with
// the reason, so the suite stays honest instead of shipping permanently red tests. They stay in the
// file as the to-do list for the post-hackathon roadmap.

test.fixme('SYSTEM 01: household and dietary preferences are available during onboarding', async ({ page }) => {
  // Not built: the MVP has no household profile. Roadmap, not part of the hackathon scope.
  await page.goto('/');
  await page.getByRole('button', { name: /^(Check my basket|Paste my list)$/ }).first().click();
  await expect(page.getByLabel(/household size/i)).toBeVisible();
  await expect(page.getByLabel(/dietary/i)).toBeVisible();
});

test.fixme('SYSTEM 05: shopper can optionally supply initial prices without blocking comparison', async ({ page }) => {
  // Not built: baselines come from the store's own prices, never from typed-in numbers.
  await makeBasket(page);
  await expect(page.getByRole('button', { name: /add (?:initial|previous) prices/i })).toBeVisible();
});

test.fixme('SYSTEM voice everywhere: store selection has voice input and read aloud', async ({ page }) => {
  // Not built: voice exists on the list, result and shopping screens, not on store selection.
  await page.goto('/');
  await navigate(page, 'list');
  await page.getByLabel('Your grocery list', { exact: true }).fill('Barilla spaghetti 16 oz');
  await page.getByRole('button', { name: /^Find cheaper options/ }).click();
  await expect(page.getByRole('button', { name: /say|speak|voice/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /read aloud/i })).toBeVisible();
});

test.fixme('SYSTEM reports: questions, custom dates and suggestions are available', async ({ page }) => {
  // Not built: the report has a week picker, categories and a price watch, but no free-text questions.
  await makeBasket(page);
  await navigate(page, 'report');
  await expect(page.getByRole('textbox', { name: /ask|question/i })).toBeVisible();
  await expect(page.getByLabel(/start date/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: /suggest/i })).toBeVisible();
});

test('SYSTEM F05: displayed prices expose product/store provenance to the shopper', async ({ page }) => {
  await makeBasket(page);
  const details = page.getByText('Price details', { exact: true }).first();
  await expect(details).toBeVisible();
  await details.click();
  await expect(page.locator('.price-details[open]').first()).toContainText(/Product ID/);
});

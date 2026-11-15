import { mkdir } from 'node:fs/promises';
import { test, expect, navigate, finishConfirmation, shopping, confirmPurchase, grantMembership } from './helpers';

test('capture representative screens and check horizontal overflow', async ({ page }, testInfo) => {
  const folder = `test-results/ui-review/${testInfo.project.name}`;
  await mkdir(folder, { recursive: true });
  async function capture(name: string) {
    await page.screenshot({ path: `${folder}/${name}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name}: no horizontal overflow`).toBeTruthy();
  }
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Same groceries/ })).toBeVisible();
  await capture('01-welcome');
  await page.getByRole('button', { name: /^(Try a sample basket|Try the example basket)$/ }).first().click();
  await expect(page.getByRole('button', { name: /Kroger · Downtown/ })).toBeVisible();
  await capture('02-store');
  await page.getByRole('button', { name: /Kroger · Downtown/ }).click();
  await finishConfirmation(page);
  await capture('03-result');
  await shopping(page);
  await capture('04-shopping');
  await confirmPurchase(page);
  await navigate(page, 'report');
  await expect(page.getByText('The weekly report is for members')).toBeVisible();
  await capture('05-report-locked');
  await navigate(page, 'plan');
  await expect(page.getByRole('heading', { name: /Your list stays free/ })).toBeVisible();
  await capture('06-plan');
  await grantMembership(page);
  await capture('07-plan-member');
  await navigate(page, 'report');
  await expect(page.getByRole('button', { name: /^Week of .*spent/ }).first()).toBeVisible();
  await capture('08-report');
});

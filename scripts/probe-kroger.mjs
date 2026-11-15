// Dependency smoke check only. No access token or secret is logged.
const base = 'https://api.kroger.com/v1';
const clientId = process.env.KROGER_CLIENT_ID;
const clientSecret = process.env.KROGER_CLIENT_SECRET;
const zip = process.env.KROGER_ZIP || '45202';
const term = process.env.KROGER_TEST_TERM || 'spaghetti';
if (!clientId || !clientSecret) {
  console.error('Missing KROGER_CLIENT_ID / KROGER_CLIENT_SECRET. Configure .env.local; do not paste keys into chat.');
  process.exit(1);
}
if (!/^\d{5}$/.test(zip)) { console.error('KROGER_ZIP must contain five digits.'); process.exit(1); }
async function json(path, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, signal: AbortSignal.timeout(20000), redirect: 'error' });
  if (!response.ok) throw new Error(`${path.split('?')[0]} returned HTTP ${response.status}. Check API subscription, scope, credentials or quota in the portal.`);
  return response.json();
}
try {
  const tokenBody = new URLSearchParams({ grant_type: 'client_credentials', scope: process.env.KROGER_SCOPE || 'product.compact' });
  const token = await json('/connect/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody,
  });
  if (!token.access_token) throw new Error('Token response did not include access_token.');
  const headers = { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json' };
  const locations = await json(`/locations?${new URLSearchParams({ 'filter.zipCode.near': zip, 'filter.limit': '3' })}`, { headers });
  const location = locations.data?.find(value => value.locationId);
  if (!location) throw new Error('No usable branch ID in locations.data. Inspect the actual API schema and coverage.');
  console.log('Branch:', JSON.stringify({ id: location.locationId, name: location.name, zip }));
  const products = await json(`/products?${new URLSearchParams({ 'filter.term': term, 'filter.locationId': location.locationId, 'filter.limit': '3' })}`, { headers });
  if (!Array.isArray(products.data) || !products.data.length) throw new Error('No products in products.data. Verify actual response schema and search term.');
  const summary = products.data.map(product => ({
    productId: product.productId, upc: product.upc, brand: product.brand, description: product.description,
    items: Array.isArray(product.items) ? product.items.map(item => ({ itemId: item.itemId, size: item.size, price: item.price ?? null, fulfillment: item.fulfillment ?? null })) : [],
  }));
  console.log('Product field sample:', JSON.stringify(summary, null, 2));
  console.log('Source:', base, '| fetchedAt:', new Date().toISOString());
  if (!summary.some(product => product.items.some(item => Number.isFinite(item.price?.regular) && item.price.regular > 0))) {
    console.error('No usable positive regular price found in the expected items[].price.regular field. Integration is NOT verified.');
    process.exitCode = 2;
  } else {
    console.log('One branch/product lookup works. Still verify equivalence, eligibility, commercial terms and quota before claiming a live optimizer.');
  }
} catch (error) {
  console.error('Kroger smoke check failed:', error.message);
  process.exitCode = 1;
}

import { createServer } from './app.mjs';

const port = Number(process.env.PORT) || 3000;
const server = createServer();

server.listen(port, '0.0.0.0', () => {
  const keys = Boolean(process.env.KROGER_CLIENT_ID && process.env.KROGER_CLIENT_SECRET);
  // Never print the keys themselves, only whether they are present.
  console.log(JSON.stringify({ msg: 'pro-groceries listening', port, krogerKeysPresent: keys }));
  if (!keys) console.log('KROGER_CLIENT_ID / KROGER_CLIENT_SECRET are not set: the site runs on labelled demo prices.');
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}

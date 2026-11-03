/** Warms Capsule's news feed when the server starts, so the first visitor does not wait on GDELT. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === 'phase-production-build') return;
  const { warm } = await import('./lib/feed');
  warm(); // not awaited: the server must not wait for GDELT
}

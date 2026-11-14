// Development host only. Copy to project root as star-letter.mock.js.
// This file is never copied to dist or used by the production game.
const store = new Map();
let order = 0;
export default {
  'storage.get': async ({ key }) => ({ value: store.get(key) ?? null, version: store.has(key) ? 1 : 0 }),
  'storage.set': async ({ key, value }) => { store.set(key, value); return { ok: true, version: 1 }; },
  'exchange.listItems': async () => ({ items: [{ id: 1, name: '回忆线索提示（模拟）', costAssetType: 1, costAmount: 0, adWatchCount: 1, targetType: 'friendship_hint', targetAmount: 1 }] }),
  'exchange.create': async () => ({ adOrderId: `local-preview-${++order}`, remainWatchCount: 1, targetWatchCount: 1, providerPlacement: '{"mockWaitSeconds":1}', targetType: 'friendship_hint', targetAmount: 1 }),
  'exchange.showRewardedAd': async () => ({ isEnded: true, count: 1 }),
  'exchange.confirm': async () => ({ success: true }),
  'exchange.cancel': async () => ({ ok: true }),
};

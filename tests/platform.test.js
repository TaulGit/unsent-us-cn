import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlatformBridge } from '../src/platform.js';

const copy = (value) => JSON.parse(JSON.stringify(value));
const initial = () => ({ version: 1, chapter: 0, clues: [], rewardIds: [], hintCredits: 2, createdAt: 1 });

function harness({ embedded = true, value = null } = {}) {
  let stored = value;
  let writes = 0;
  let exchanges = 0;
  let localAccesses = 0;
  const local = new Map();
  const listeners = new Map();
  const order = { bizId: 'business-001', adOrderId: 'advertisement-001',
    targetType: 'friendship_hint', targetAmount: 1 };
  const sdk = {
    context: { gameId: 10588, user: { id: 21 } },
    on(name, fn) { listeners.set(name, fn); return () => listeners.delete(name); },
    storage: {
      async get() { return { value: stored === null ? null : copy(stored), version: stored ? 1 : 0 }; },
      async set(input) { writes += 1; stored = copy(input.value); return { ok: true, version: writes }; },
    },
    exchange: {
      async listItems() { return { items: [{ id: 8479, targetType: 'friendship_hint', targetAmount: 1, adWatchCount: 1 }] }; },
      async exchange(input) { exchanges += 1; await input.deliver(order); return order; },
    },
  };
  const win = {
    GameSDK: { async init() { return sdk; }, isPlatformSDKError: (error) => error?.sdk === true },
    localStorage: {
      getItem(key) { localAccesses += 1; return local.get(key) || null; },
      setItem(key, next) { localAccesses += 1; local.set(key, next); },
    },
  };
  win.self = win;
  win.top = embedded ? {} : win;
  const makeBridge = () => createPlatformBridge({ getWindow: () => win, now: () => 20_000 });
  return { sdk, win, order, listeners, makeBridge, getStored: () => stored,
    counts: () => ({ writes, exchanges, localAccesses }) };
}

async function boot(h) {
  const bridge = h.makeBridge();
  await bridge.initPlatform();
  await bridge.loadProgress();
  return bridge;
}

function rewardSaver(bridge, getState, setState) {
  return async ({ requestId }) => {
    const current = getState();
    const next = { ...current, hintCredits: current.hintCredits + 1, rewardIds: [...current.rewardIds, requestId] };
    if (!await bridge.saveProgress(next)) throw new Error('Persistence failed');
    setState(next);
  };
}

test('standalone saves locally, never invokes the embedded SDK or pretends to show an ad', async () => {
  const h = harness({ embedded: false });
  h.win.GameSDK.init = async () => { throw new Error('must not initialize standalone'); };
  const bridge = await boot(h);
  assert.equal(bridge.getPlatformStatus().mode, 'local');
  assert.equal(await bridge.saveProgress(initial()), true);
  assert.deepEqual(await bridge.loadProgress(), initial());
  assert.equal((await bridge.showRewardedHint()).rewarded, false);
  assert.equal(h.counts().exchanges, 0);
});

test('an iframe without the SDK cannot silently fall back to a local save', async () => {
  const h = harness();
  delete h.win.GameSDK;
  const bridge = h.makeBridge();
  assert.equal((await bridge.initPlatform()).mode, 'unavailable');
  await assert.rejects(bridge.loadProgress());
  assert.equal(await bridge.saveProgress(initial()), false);
  assert.equal(h.counts().localAccesses, 0);
});

test('a failed cloud read prevents overwriting an existing save with an empty game', async () => {
  const h = harness({ value: { schemaVersion: 1, progress: { ...initial(), chapter: 3 }, adReceipts: [] } });
  h.sdk.storage.get = async () => { throw { sdk: true, code: 'STORAGE_READ_UNAVAILABLE' }; };
  const bridge = h.makeBridge();
  await bridge.initPlatform();
  await assert.rejects(bridge.loadProgress(), /读取云存档/);
  assert.equal(await bridge.saveProgress(initial()), false);
  assert.equal(h.getStored().progress.chapter, 3);
  assert.equal(h.counts().writes, 0);
});

test('cloud saves use one private key, serialize writes and retain the latest complete snapshot', async () => {
  const h = harness();
  const writes = [];
  const originalSet = h.sdk.storage.set;
  h.sdk.storage.set = async (input) => {
    writes.push(input);
    await new Promise((resolve) => setTimeout(resolve, input.value.progress.chapter === 1 ? 8 : 0));
    return originalSet(input);
  };
  const bridge = await boot(h);
  const result = await Promise.all([
    bridge.saveProgress({ ...initial(), chapter: 1 }),
    bridge.saveProgress({ ...initial(), chapter: 2 }),
  ]);
  assert.deepEqual(result, [true, true]);
  assert.equal(h.getStored().progress.chapter, 2);
  assert.equal(new Set(writes.map((entry) => entry.key)).size, 1);
  assert.ok(writes.every((entry) => entry.scope === 'user' && entry.saveMeta.gameVersion === '1.0.0'));
  assert.equal(h.counts().localAccesses, 0);
});

test('a completed ad persists one reward and its receipt before returning, including after a reload', async () => {
  const h = harness();
  const bridge = await boot(h);
  let state = initial();
  let grants = 0;
  const first = await bridge.showRewardedHint({ onReward: rewardSaver(bridge, () => state, (next) => { state = next; grants += 1; }) });
  assert.equal(first.rewarded, true);
  assert.equal(state.hintCredits, 3);
  assert.equal(h.getStored().adReceipts[0].adOrderId, h.order.adOrderId);
  assert.equal(h.getStored().progress.hintCredits, 3);

  const reloaded = await boot(h);
  const restored = await reloaded.loadProgress();
  assert.equal(restored.hintCredits, 3);
  const again = await reloaded.showRewardedHint({ onReward: async () => { grants += 1; } });
  assert.equal(again.alreadyGranted, true);
  assert.equal(grants, 1);
  assert.equal(h.getStored().progress.hintCredits, 3);
});

test('cancelled and failed advertisements never award a hint and always restore pause/input state', async () => {
  for (const code of ['AD_USER_CANCELLED', 'AD_FAILED', 'AD_TIMEOUT']) {
    const h = harness();
    h.sdk.exchange.exchange = async () => { throw { sdk: true, code }; };
    const bridge = await boot(h);
    let grants = 0;
    const result = await bridge.showRewardedHint({ onReward: async () => { grants += 1; } });
    assert.equal(result.rewarded, false);
    assert.equal(grants, 0);
    assert.equal(h.counts().writes, 0);
    assert.equal(bridge.getPlatformStatus().paused, false);
    assert.equal(bridge.getPlatformStatus().adBusy, false);
  }
});

test('a rejected reward save throws from deliver rather than reporting successful delivery', async () => {
  const h = harness();
  h.sdk.storage.set = async () => { throw { sdk: true, code: 'STORAGE_NETWORK_ERROR' }; };
  const bridge = await boot(h);
  let state = initial();
  const result = await bridge.showRewardedHint({ onReward: rewardSaver(bridge, () => state, (next) => { state = next; }) });
  assert.equal(result.rewarded, false);
  assert.equal(state.hintCredits, 2);
  assert.equal(h.getStored(), null);
  assert.equal(bridge.getPlatformStatus().adBusy, false);
});

test('parallel ad clicks run only one exchange and cannot issue two rewards', async () => {
  const h = harness();
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  const original = h.sdk.exchange.exchange;
  h.sdk.exchange.exchange = async (input) => { await wait; return original(input); };
  const bridge = await boot(h);
  let state = initial();
  const first = bridge.showRewardedHint({ onReward: rewardSaver(bridge, () => state, (next) => { state = next; }) });
  const duplicate = await bridge.showRewardedHint({ onReward: async () => assert.fail('duplicate callback') });
  assert.equal(duplicate.rewarded, false);
  release();
  assert.equal((await first).rewarded, true);
  assert.equal(h.counts().exchanges, 1);
  assert.equal(state.hintCredits, 3);
});

test('switching accounts invalidates the active state before any further write', async () => {
  const h = harness();
  const bridge = await boot(h);
  h.sdk.context.user = { id: 99 };
  h.listeners.get('context.update')();
  assert.equal(await bridge.saveProgress(initial()), false);
  assert.equal(bridge.getPlatformStatus().readBlocked, true);
  assert.equal(bridge.getPlatformStatus().mode, 'unavailable');
  assert.equal(h.counts().writes, 0);
});

test('a player can explicitly retry a failed read without ever writing over the original save', async () => {
  const h = harness({ value: { schemaVersion: 1, progress: { ...initial(), chapter: 2 }, adReceipts: [] } });
  const originalGet = h.sdk.storage.get;
  h.sdk.storage.get = async () => { throw { sdk: true, code: 'STORAGE_READ_UNAVAILABLE' }; };
  const bridge = h.makeBridge();
  await bridge.initPlatform();
  await assert.rejects(bridge.loadProgress());
  h.sdk.storage.get = originalGet;
  assert.equal((await bridge.loadProgress()).chapter, 2);
  assert.equal(bridge.getPlatformStatus().readBlocked, false);
  assert.equal(h.counts().writes, 0);
});

test('saves retain player actions and omit derived scores, dialogue index and ending', async () => {
  const h = harness();
  const bridge = await boot(h);
  const state = { ...initial(), choices: [{ roundId: 'r1', choiceId: 'honest' }],
    scores: { empathy: 2, honesty: 2 }, dialogueIndex: 1, ending: 'reconnect' };
  assert.equal(await bridge.saveProgress(state), true);
  const saved = h.getStored().progress;
  assert.equal('scores' in saved, false);
  assert.equal('dialogueIndex' in saved, false);
  assert.equal('ending' in saved, false);
  assert.deepEqual(saved.choices, state.choices);
  assert.equal(state.ending, 'reconnect');
});

test('concurrent duplicate callbacks for the same completed ad are still delivered once', async () => {
  const h = harness();
  h.sdk.exchange.exchange = async (input) => {
    await Promise.all([input.deliver(h.order), input.deliver(h.order)]);
    return h.order;
  };
  const bridge = await boot(h);
  let state = initial();
  let grants = 0;
  const result = await bridge.showRewardedHint({ onReward: rewardSaver(bridge, () => state, (next) => { grants += 1; state = next; }) });
  assert.equal(result.rewarded, true);
  assert.equal(grants, 1);
  assert.equal(state.hintCredits, 3);
  assert.equal(h.getStored().adReceipts.length, 1);
});

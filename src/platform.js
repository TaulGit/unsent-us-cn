/** Star-letter v2.7.2 integration. API contracts: docs/PLATFORM.md. */
const SAVE_KEY = 'unsent-us:progress:v1';
const LOCAL_KEY = 'unsent-us:standalone:v1';
const REWARD_TARGET = 'friendship_hint';
const MAX_SAVE_BYTES = 50_000;
const MAX_RECEIPTS = 256;

const plain = (value) => JSON.parse(JSON.stringify(value));
const bytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length;

const storageErrors = {
  STORAGE_VALUE_TOO_LARGE: '存档内容超过容量，请保留当前页面并重试。',
  STORAGE_QUOTA_EXCEEDED: '云存档空间暂时不足，当前进度仍保留在页面中。',
  STORAGE_CONFLICT: '另一设备更新了存档，请重新读取后继续。',
  STORAGE_RATE_LIMITED: '保存操作较频繁，请稍后点击保存。',
  STORAGE_REQUIRE_LOGIN: '登录星匣后即可使用云存档。',
  STORAGE_READ_UNAVAILABLE: '暂时无法读取云存档，已停止写入以保护原进度。',
  STORAGE_WRITE_LOCK_HELD: '存档正由另一会话使用，请稍后重试。',
  STORAGE_WRITE_GENERATION_STALE: '存档会话已更新，请刷新页面后继续。',
};

/** A factory also allows deterministic tests without shipping a mock SDK. */
export function createPlatformBridge({ getWindow = () => globalThis.window, now = () => Date.now(), cooldownMs = 15_000 } = {}) {
  let sdk;
  let initPromise;
  let onStatus = () => {};
  let saveChain = Promise.resolve();
  let identityEpoch = 0;
  let readReady = false;
  let progress = null;
  let receipts = [];
  let confirmedReceiptIds = new Set();
  let stagedReceipt = null;
  let activeItem = null;
  let lastAdAttempt = -Infinity;
  const deliveries = new Map();
  const disposers = [];
  let status = {
    mode: 'unavailable', message: '正在连接存档…', gameId: null,
    adsAvailable: false, adBusy: false, paused: false,
    saving: false, readBlocked: false, savedAt: null,
  };

  function update(fields) {
    status = { ...status, ...fields };
    try { onStatus({ ...status }); } catch { /* UI callbacks cannot break persistence. */ }
  }

  function isPlatformSDKError(error) {
    const guard = getWindow()?.GameSDK?.isPlatformSDKError;
    return typeof guard === 'function' && guard(error);
  }

  function explain(error, fallback) {
    return isPlatformSDKError(error) ? (storageErrors[error.code] || fallback) : fallback;
  }

  function embedded(win) {
    try { return win.self !== win.top; } catch { return true; }
  }

  async function refreshAdItems() {
    activeItem = null;
    if (status.mode !== 'platform' || !sdk?.exchange?.listItems) {
      update({ adsAvailable: false });
      return;
    }
    try {
      const response = await sdk.exchange.listItems();
      activeItem = response.items?.find((item) =>
        item.targetType === REWARD_TARGET && item.targetAmount === 1 &&
        Number.isSafeInteger(item.id) && item.id > 0 && Number(item.adWatchCount) >= 1
      ) || null;
      update({ adsAvailable: Boolean(activeItem) && receipts.length < MAX_RECEIPTS });
    } catch (error) {
      update({ adsAvailable: false, adMessage: explain(error, '广告提示暂不可用，可继续寻找免费线索。') });
    }
  }

  async function initPlatform(options = {}) {
    if (options.onStatus) onStatus = options.onStatus;
    if (options.retry === true && status.mode === 'unavailable' && !status.adBusy) {
      shutdown();
      identityEpoch += 1;
      initPromise = null;
      sdk = undefined;
      readReady = false;
      progress = null;
      receipts = [];
      confirmedReceiptIds = new Set();
      activeItem = null;
      update({ readBlocked: false, message: '正在重新连接星匣…' });
    }
    if (initPromise) return initPromise;
    initPromise = (async () => {
      const win = getWindow();
      if (!win) {
        update({ mode: 'unavailable', message: '当前环境无法连接存档。' });
        return { ...status };
      }
      if (!embedded(win)) {
        update({ mode: 'local', message: '本机存档 · 在星匣内游玩可使用云存档', adsAvailable: false });
        return { ...status };
      }
      if (!win.GameSDK?.init) {
        update({ mode: 'unavailable', message: '平台连接尚未完成，当前进度仅保留在页面中。' });
        return { ...status };
      }
      try {
        sdk = await win.GameSDK.init();
        update({ mode: 'platform', gameId: sdk.context.gameId, message: '星匣云存档已连接' });
        const originalUser = sdk.context.user?.id ?? null;
        if (typeof sdk.on === 'function') {
          disposers.push(sdk.on('context.update', () => {
            if ((sdk.context.user?.id ?? null) === originalUser) return;
            identityEpoch += 1;
            readReady = false;
            progress = null;
            receipts = [];
            confirmedReceiptIds = new Set();
            update({ mode: 'unavailable', readBlocked: true, adsAvailable: false,
              message: '登录账号已变化，请刷新页面后读取该账号的进度。' });
          }));
          disposers.push(sdk.on('ad.pause', () => update({ paused: true })));
          disposers.push(sdk.on('ad.resume', () => update({ paused: false })));
        }
        await refreshAdItems();
      } catch (error) {
        update({ mode: 'unavailable', message: explain(error, '星匣连接失败，当前进度仅保留在页面中。') });
      }
      return { ...status };
    })();
    return initPromise;
  }

  function unpack(value) {
    if (value === null || value === undefined) {
      progress = null;
      receipts = [];
    } else if (value.schemaVersion === 1 && Object.hasOwn(value, 'progress')) {
      progress = value.progress;
      receipts = Array.isArray(value.adReceipts) ? value.adReceipts.filter((row) =>
        row && typeof row.requestId === 'string' && typeof row.bizId === 'string' &&
        typeof row.adOrderId === 'string'
      ) : [];
    } else if (value.version === 1) {
      // A pre-wrapper v1 progress object remains readable, without changing its meaning.
      progress = value;
      receipts = [];
    } else {
      throw new Error('存档格式暂不受支持，请保留原存档。');
    }
    confirmedReceiptIds = new Set(receipts.map((row) => row.requestId));
    return progress === null ? null : plain(progress);
  }

  async function loadProgress() {
    if (!initPromise) await initPlatform();
    const epoch = identityEpoch;
    try {
      let value;
      if (status.mode === 'platform') {
        const response = await sdk.storage.get({ key: SAVE_KEY, scope: 'user' });
        value = response.value;
      } else if (status.mode === 'local') {
        const raw = getWindow().localStorage.getItem(LOCAL_KEY);
        value = raw ? JSON.parse(raw) : null;
      } else {
        throw new Error(status.message);
      }
      if (epoch !== identityEpoch) throw new Error('登录账号已变化，请刷新页面。');
      const result = unpack(value);
      readReady = true;
      update({ readBlocked: false, message: status.mode === 'platform' ? '云端进度已读取' : '本机进度已读取' });
      return result;
    } catch (error) {
      readReady = false;
      update({ readBlocked: true, message: explain(error, '读取存档失败，已停止保存以保护原进度。') });
      throw new Error(status.message, { cause: error });
    }
  }

  function makeEnvelope(snapshot) {
    const ledger = stagedReceipt && snapshot.rewardIds?.includes(stagedReceipt.requestId) &&
      !receipts.some((row) => row.requestId === stagedReceipt.requestId)
      ? [...receipts, stagedReceipt] : [...receipts];
    // These fields are deterministically rebuilt from choices by engine.restoreState.
    const { scores, ending, dialogueIndex, ...facts } = snapshot;
    return { schemaVersion: 1, progress: facts, adReceipts: ledger };
  }

  async function writeSnapshot(snapshot, epoch) {
    if (!readReady || epoch !== identityEpoch || !['platform', 'local'].includes(status.mode)) return false;
    const envelope = makeEnvelope(snapshot);
    if (bytes(envelope) >= MAX_SAVE_BYTES) {
      update({ message: '存档内容超过本作容量，当前进度仍保留在页面中。' });
      return false;
    }
    update({ saving: true });
    try {
      if (status.mode === 'platform') {
        const response = await sdk.storage.set({
          key: SAVE_KEY, scope: 'user', value: envelope,
          saveMeta: {
            label: snapshot.ending ? '未发送的我们 · 已抵达结局' : `未发送的我们 · 第 ${Number(snapshot.chapter || 0) + 1} 章`,
            progress: `${snapshot.clues?.length || 0} 条回忆`,
            gameVersion: '1.1.0', playedTime: Math.max(0, now() - Number(snapshot.createdAt || now())),
          },
        });
        if (!response?.ok || (response.outcome && response.outcome !== 'written')) {
          update({ message: '云端尚未确认这次保存，请稍后手动保存。' });
          return false;
        }
      } else {
        getWindow().localStorage.setItem(LOCAL_KEY, JSON.stringify(envelope));
      }
      if (epoch !== identityEpoch) return false;
      progress = snapshot;
      receipts = envelope.adReceipts;
      confirmedReceiptIds = new Set(receipts.map((row) => row.requestId));
      update({ savedAt: now(), message: status.mode === 'platform' ? '进度已保存到云端' : '进度已保存在本机' });
      return true;
    } catch (error) {
      update({ message: explain(error, '保存暂未完成，当前进度仍在页面中，请稍后手动保存。') });
      return false;
    } finally {
      update({ saving: false });
    }
  }

  async function saveProgress(state) {
    let snapshot;
    try { snapshot = plain(state); } catch { return false; }
    const epoch = identityEpoch;
    const operation = saveChain.then(() => writeSnapshot(snapshot, epoch));
    saveChain = operation.catch(() => false);
    return operation;
  }

  async function showRewardedHint({ onReward } = {}) {
    if (status.mode !== 'platform') return { rewarded: false, reason: '广告提示仅在星匣游戏内提供。' };
    if (!readReady) return { rewarded: false, reason: '先成功读取存档，再领取广告提示。' };
    if (status.adBusy) return { rewarded: false, reason: '广告正在进行，请稍候。' };
    if (now() - lastAdAttempt < cooldownMs) return { rewarded: false, reason: '请稍候片刻，再主动领取提示。' };
    if (typeof onReward !== 'function') return { rewarded: false, reason: '提示发放尚未就绪，请稍后再试。' };
    if (receipts.length >= MAX_RECEIPTS) return { rewarded: false, reason: '本次旅程已领取足够多的广告提示。' };

    const epoch = identityEpoch;
    let delivered = null;
    update({ adBusy: true });
    try {
      await refreshAdItems();
      if (!activeItem) return { rewarded: false, reason: '广告暂不可用，仍可免费探索全部剧情。' };
      if (epoch !== identityEpoch) return { rewarded: false, reason: '账号已变化，请刷新页面。' };
      lastAdAttempt = now();
      update({ paused: true });
      await sdk.exchange.exchange({
        exchangeItemId: activeItem.id,
        via: 'ad',
        deliver: async (order) => {
          if (epoch !== identityEpoch) throw new Error('登录账号已变化。');
          if (order.targetType !== REWARD_TARGET || order.targetAmount !== 1 ||
              !order.adOrderId || typeof order.bizId !== 'string' || !order.bizId) {
            throw new Error('广告提示的发货信息不匹配。');
          }
          const requestId = `ad:${String(order.adOrderId)}`;
          if (confirmedReceiptIds.has(requestId)) {
            delivered = { requestId, alreadyGranted: true };
            return;
          }
          if (deliveries.has(requestId)) {
            await deliveries.get(requestId);
            delivered = { requestId, alreadyGranted: true };
            return;
          }
          const delivery = (async () => {
            stagedReceipt = { requestId, bizId: order.bizId, adOrderId: String(order.adOrderId),
              ...(order.exchangeOrderId ? { exchangeOrderId: order.exchangeOrderId } : {}), grantedAt: now() };
            try {
              // The caller grants exactly one credit and awaits saveProgress inside this callback.
              await onReward({ requestId, targetType: REWARD_TARGET, targetAmount: 1 });
              if (!confirmedReceiptIds.has(requestId)) throw new Error('提示尚未写入存档。');
            } catch (error) {
              // A later UI callback error cannot undo a reward that was durably committed.
              if (!confirmedReceiptIds.has(requestId)) throw error;
            } finally {
              stagedReceipt = null;
            }
          })();
          deliveries.set(requestId, delivery);
          try {
            await delivery;
            delivered = { requestId, alreadyGranted: false };
          } finally {
            deliveries.delete(requestId);
          }
        },
      });
      return delivered ? { rewarded: true, ...delivered } : { rewarded: false, reason: '广告尚未确认完成。' };
    } catch (error) {
      if (isPlatformSDKError(error)) {
        if (['AD_USER_CANCELLED', 'EXCHANGE_CANCELLED'].includes(error.code)) {
          return { rewarded: false, reason: '广告未完整观看，没有消耗提示次数。' };
        }
        if (['AD_FAILED', 'AD_TIMEOUT', 'AD_WATCH_CONFIRM_TIMEOUT', 'EXCHANGE_TIMEOUT'].includes(error.code)) {
          return { rewarded: false, reason: '广告暂未完成，请稍后主动重试。' };
        }
        if (delivered) {
          // The persisted receipt is authoritative for local delivery; never grant again here.
          return { rewarded: true, ...delivered, reason: '提示已保存，广告结果仍待平台确认。' };
        }
      }
      return { rewarded: false, reason: '广告结果暂未确认，请检查提示次数后再操作。' };
    } finally {
      stagedReceipt = null;
      update({ adBusy: false, paused: false });
    }
  }

  function shutdown() {
    for (const dispose of disposers.splice(0)) {
      try { if (typeof dispose === 'function') dispose(); } catch { /* Best-effort cleanup. */ }
    }
  }

  return { initPlatform, loadProgress, saveProgress, showRewardedHint,
    getPlatformStatus: () => ({ ...status }), shutdown };
}

const bridge = createPlatformBridge();
export const initPlatform = bridge.initPlatform;
export const loadProgress = bridge.loadProgress;
export const saveProgress = bridge.saveProgress;
export const showRewardedHint = bridge.showRewardedHint;
export const getPlatformStatus = bridge.getPlatformStatus;
export const shutdownPlatform = bridge.shutdown;

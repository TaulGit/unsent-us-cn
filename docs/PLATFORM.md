# 星匣接入说明

本作采用官方 IIFE SDK `v2`，在 2026-11-13 从带时间戳的 `latest.json` 解析到 **2.7.2 / 文档修订 43**。官方文档按版本缓存于 `~/.star-letter/sdk-docs/v2.7.2/rev43/`，不把平台凭据或缓存带进仓库。

- [版本清单](https://gz-vchar-pub.nosdn.127.net/star-letter/game-sdk-docs/latest.json)
- [初始化与生命周期](https://gz-vchar-pub.nosdn.127.net/star-letter/game-sdk-docs/v2.7.2/runtime.md)
- [云存档](https://gz-vchar-pub.nosdn.127.net/star-letter/game-sdk-docs/v2.7.2/storage.md)
- [广告兑换与发货](https://gz-vchar-pub.nosdn.127.net/star-letter/game-sdk-docs/v2.7.2/exchange.md)
- [能力声明](https://gz-vchar-pub.nosdn.127.net/star-letter/game-sdk-docs/v2.7.2/capability-declaration.md)

## 运行方式

`index.html` 在业务模块前引入：

```html
<script src="https://gz-vchar-pub.nosdn.127.net/star-letter/game-sdk/v2/sdk.iife.js"></script>
```

`src/platform.js` 调用 `await window.GameSDK.init()`，由平台注入 `sdk.context.gameId`。生产代码不硬编码游戏 ID，不实现私有 bridge，不直接调用 `postMessage`。

封装只提供两种明确的持久化路径：

- 星匣 iframe：`sdk.storage` 云存档。初始化或读取失败会阻止写入，不把读取失败当作“没有存档”。
- 独立打开的本地/GitHub 页面：本机 `localStorage`，界面明确显示“本机存档”。此模式不初始化平台 SDK，也不能观看广告。

iframe 中 SDK 不可用时不会暗中切成本机存档；当前进度只存在内存，界面显示失败原因。

## 导出接口

```js
await initPlatform({ onStatus: (status) => { /* 更新保存状态和广告暂停状态 */ } });
const saved = await loadProgress(); // 读取失败会 throw，不能当作空档自动覆盖。
const ok = await saveProgress(state); // false 表示没有取得保存成功确认。
const status = getPlatformStatus();
```

`initPlatform()` 幂等；连接失败后可由玩家明确点击重试，再执行 `initPlatform({ retry: true })` 与 `loadProgress()`。仅云端读取失败而连接仍有效时，直接重新调用 `loadProgress()` 即可。成功读取前，`saveProgress` 一律返回 `false`。

状态包含 `mode`、`message`、`gameId`、`adsAvailable`、`adBusy`、`paused`、`saving`、`readBlocked` 和 `savedAt`。UI 在 `adBusy/paused` 时应暂停音频并阻止游戏输入。

游戏状态需要经过 `restoreState(saved)` 恢复；该函数校验证据与章节门禁，并从对话选择重新计算分数与结局。

## 存档

唯一云端 key 是 `unsent-us:progress:v1`，显式使用 `scope: 'user'`。存档包包含：

```js
{
  schemaVersion: 1,
  progress: { /* 引擎的玩家行动事实 */ },
  adReceipts: [
    { requestId, bizId, adOrderId, grantedAt }
  ]
}
```

所有写入先深拷贝为普通 JSON，严格限制在 50,000 UTF-8 字节以下，按调用顺序串行提交。没有定时轮询、逐条实体写入、CAS 重试循环或云存档失败后的自建本地副本。`saveMeta` 包含章节标签、线索进度、游戏版本及会话时长提示。

`scores`、`dialogueIndex`、`ending` 不写入 payload，由已确认的 `choices` 重建；`chapter/finale/clues/solved` 等玩家推进事实保留。

SDK 2.7.2 文档已明确平台切换到云端直写；本作不接入已废弃的同步冲突/热切档回调。`outcome/source` 未出现时正常工作；兼容旧宿主返回非确认终态时，不报告“已保存”。

本作自己的存档包版本为 `schemaVersion: 1`。早期裸 `version: 1` 引擎存档仍可读；未知包版本保留原档并阻止覆写。

## 广告提示

SDK 没有独立 `ads` namespace。正确流程是：

1. `sdk.exchange.listItems()` 发现当前可用的 `targetType: 'friendship_hint'` 项目。
2. 玩家主动点击后，调用 `sdk.exchange.exchange({ exchangeItemId, via: 'ad', deliver })`。
3. 平台确认广告看满后，才调用 `deliver(order)`。
4. `deliver` 内按广告订单标识幂等增加一个提示，并等待包含奖励与订单凭据的完整存档成功后才返回。

平台已为本作配置广告兑换项：游戏 **10588**，项目 **8479**，`targetType=friendship_hint`，`targetAmount=1`，`costAmount=0`，`adWatchCount=1`。这些 ID 仅记录配置事实，运行代码按 `targetType` 动态发现，不硬编码项目 ID。

应用调用示例：

```js
const result = await showRewardedHint({
  onReward: async ({ requestId }) => {
    const next = grantHint(state, requestId);
    if (!await saveProgress(next)) throw new Error('奖励尚未保存');
    state = next;
    render();
  },
});
// 不要在 result.rewarded 后再次加提示；发货已经在 onReward 内完成。
```

一次只允许一个广告请求，主动请求之间有 15 秒冷却。取消、未看满、超时、加载失败均不发奖励，也不会自动重试或自动弹出广告。成功订单与进度同 key 持久化，刷新后相同订单回调不再加提示。订单凭据最多保留 256 笔；达到上限后停止新增广告领取，不遗忘旧订单以换取重复发货风险。

广告不解锁主线、不改变对话结果、不占用已有免费提示。全部剧情和三个结局都能在不观看广告的情况下完成。

## 本地联调与验证

运行 `star-letter dev` 后，在平台 `/dev/preview` 切换 exchange 的模拟/真实档位。若需要模拟广告流程，根目录 mock 的 RPC key 应为 `exchange.listItems`、`exchange.create`、`exchange.showRewardedAd`，不能把 mock 放进生产 `dist/`。

可将[示例](star-letter.mock.example.js)复制为工程根的`star-letter.mock.js`再重启CLI；若另有同名`.ts`文件，应按官方优先级规则处理。示例只在开发宿主使用，不进入构建产物。

`tests/platform.test.js` 使用隔离的假宿主验证持久化与奖励边界，不把它标记为真实广告播放：

- 独立页面的本机存档与广告不可用。
- 平台失败不回退本机存档；读取失败不覆盖已有云档。
- 串行保存与私有 scope。
- 广告成功持久化、刷新后相同订单不重复发货。
- 广告取消/失败/超时不发奖励并恢复暂停状态。
- 存档失败时 `deliver` 不报告成功。
- 并发点击只发起一次兑换；切换账号停止旧状态写入。
- 并发重复发货回调仍只发一次；读取失败后可明确重试；存档剔除派生字段。

真实宿主的云存档、项目列表、广告播放和草稿 CDN 完整性由主开发流程另行验收；以实际验证记录为准。

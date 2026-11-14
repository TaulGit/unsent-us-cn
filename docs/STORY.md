# 《未发送的我们》剧情与推理契约

完全原创中文叙事。参考《A Normal Lost Phone》的跨应用线索组织与《Emily is Away》的关系变化表达，不复用其角色、剧情、台词或资产。

## 视角与事实

玩家是周遥，查看的是沈知夏主动寄来的旧手机。手机聊天右侧 `out` 永远属于机主沈知夏，左侧 `in` 属于联系人。2026年周遥先明确同意收取手机，知夏清理无关私人内容；游戏调查围绕两人共同项目展开。

2019年两位女性好友筹办“雨声放映计划”，各出9000元，18000元共同资金明确用于设备维修预付款。沈知夏未获周遥同意，将全额转作母亲印刷铺租金，寄望并未保证日期的短片尾款在8月16日到账。当天10:06尾款确认延迟，维修付款期限为16:00。期间存在1800元可退押金的备机方案，但知夏隐瞒情况并错过窗口，8月17日18:10才用“暴雨与场地停用”取消18:30的放映。

周遥主动到场、试图帮忙却不知实情。当晚争执中，她故意删除两人共同采集的四小时录音，没有确认备份；知夏也没有按计划备份。录音仅恢复1分47秒。两人互发气话后断联。8月30日尾款到账，31日知夏退还周遥9000元本金。退款与删除录音均不取消彼此其他责任。

2026年旧机修好，知夏主动提出不附条件的回看邀请。11月14日重逢。和解、保持距离、认真告别都是完整结局，不能把告别写成道德失败。

## 导出

`GAME`, `CONTACTS`, `THREADS`, `PHOTOS`, `NOTES`, `TRANSACTIONS`, `CLUES`, `PUZZLES`, `CHAPTERS`, `FINALE`, `ENDINGS`。

- `THREADS.messages` 拥有全局唯一 `id`，`side` 为 `in|out|system`，可选 `clueId`。
- `PHOTOS`, `NOTES`, `TRANSACTIONS` 使用 `chapter` 控制可见范围，可选 `clueId` 表示查看后发现。
- `CLUES` 共20条，每章4条。
- 谜题答案：`code` 是字符串，`choice` 是option id，`order` 是正确顺序的option id数组。代码输入允许规范化由engine处理。
- `FINALE.rounds` 共6轮，每轮3个选择，均提供 `response` 与 `effects: {empathy,boundary,honesty}`。

## 调查链与无死锁保证

| 章 | 本章四条必需线索 | 谜题及答案 |
|---|---|---|
| 0 手机亮起 | `c0-return` 盒子纸条；`c0-pact` 天台合照；`c0-date` 雨天海报背面；`c0-invite` 禾姐2026聊天 | `p0-date`: `0817`。照片明确首场日期，目录明确四位月日。 |
| 1 余额之外 | `c1-fund` 周遥项目入账；`c1-quote` 维修报价；`c1-rent` 店租转账；`c1-tailpayment` 林旻延期聊天 | `p1-money`: `['held','moved','delayed','missed']`。筹资→挪用→尾款延期→维修期限经过。 |
| 2 雨没有停站 | `c2-no-ban` 禾姐场地聊天；`c2-backup` 程师傅备机聊天；`c2-cancel` 取消告示；`c2-post` 周遥到场聊天 | `p2-cancel`: `withheld`。场地可用、备机存在、周遥到场，排除天气必然取消的说法。 |
| 3 删掉以后 | `c3-voice` 录音机照片；`c3-delete` 周遥删录音承认；`c3-reply` 双方气话；`c3-repayment` 9000元退款 | `p3-accountability`: `both`。分别承担责任，不把伤害相减。 |
| 4 今天的座位 | `c4-letter` 不是草稿；`c4-boundary` 给自己的约定；`c4-ticket` 新旧车票；`c4-present` 两杯茶 | 无谜题。四条齐全后可进入六轮重逢。 |

所有必须证据都在当前章或已解锁章节内。谜题不要求未来线索。章1账单可读到8月30日的实际到账，章3再出现退款，是证据主题分组而非强制按日倒放。

## 结局可达性

engine规则为 `empathy >= 6 && honesty >= 5` 得到 `reconnect`；否则 `empathy <= 1` 得到 `farewell`；其余 `distance`。

- 六轮全选第一项：empathy 12，honesty 6，boundary 6，可达重联。
- 六轮全选第二项：empathy 3，honesty 6，boundary 12，可达保留距离。边界明确不等于不诚实，因此三种路线都可获得honesty 6。
- 六轮全选第三项：empathy -1，honesty 6，boundary 12，可达认真告别。

最终选择优先尊重明确边界：`r6-goodbye`直接得到`farewell`，`r6-distance`直接得到`distance`；其余再使用共情与诚实阈值。engine已与主Agent确认集成，累计分数不会覆盖明确告别或保留距离。

## 资产

六张相册使用 `assets/photo-{rain,rooftop,station,recorder,ticket,cafe}.webp`。照片像素中不要求可辨文字；日期、手写内容及证据均以游戏内照片说明提供，保证可读与可推理。结局为 `assets/ending-{reconnect,distance,farewell}.webp`，头像为 `assets/portrait-{zhixia,zhouyao}.webp`。

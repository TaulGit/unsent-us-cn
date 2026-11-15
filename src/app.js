import {
  GAME,
  THREADS,
  PHOTOS,
  NOTES,
  TRANSACTIONS,
  CLUES,
  CHAPTERS,
  PUZZLES,
  FINALE,
  ENDINGS,
} from "./story.js";
import {
  createState,
  restoreState,
  collectClue,
  solvePuzzle,
  chapterReady,
  advanceChapter,
  chooseDialogue,
  getEnding,
  getProgress,
  grantHint,
  consumeHint,
  nextHint,
} from "./engine.js";
import {
  initPlatform,
  loadProgress,
  saveProgress,
  showRewardedHint,
  getPlatformStatus,
} from "./platform.js";
import {
  setSound,
  pauseSound,
  isSoundEnabled,
  chime,
  playArchive,
  stopArchive,
  setMusicScene,
  unlockSound,
} from "./audio.js";

const root = document.querySelector("#app"),
  modal = document.querySelector("#modal");
const esc = (value = "") =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const img = (src, alt = "", cls = "") =>
  `<img src="./${esc(src)}" alt="${esc(alt)}" class="${cls}" loading="lazy" decoding="async">`;
const getClue = (id) => CLUES.find((c) => c.id === id);
const unlocked = (item) => item.chapter <= state.chapter;
const visible = (items) => items.filter(unlocked);
const appDefs = [
  ["messages", "聊天", 0],
  ["photos", "相册", 1],
  ["notes", "备忘录", 2],
  ["bills", "账单", 3],
  ["voice", "声音", 4],
  ["case", "推理", 5],
];
let state = createState(),
  saved = null,
  loaded = false,
  bootError = "",
  status = getPlatformStatus();
let ui = {
  screen: "cover",
  app: "home",
  item: null,
  search: "",
  answer: null,
  order: [],
  feedback: null,
  response: null,
  recording: false,
};
let saveTimer,
  toastTimer,
  archiveEnd,
  requestingAd = false,
  readable = false,
  initialized = false;
let lastFocus = null;

function toast(text) {
  const el = document.querySelector("#toast");
  el.textContent = text;
  el.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("visible"), 3300);
}
function showModal(title, body) {
  lastFocus = document.activeElement;
  modal.className = "modal";
  modal.innerHTML = `<div class="modal-top"><h2>${esc(title)}</h2><button class="modal-close" data-action="close">关闭</button></div><div class="modal-content">${body}</div>`;
  if (!modal.open) modal.showModal();
  modal.querySelector("button")?.focus();
}
function closeModal() {
  if (modal.open) modal.close();
  lastFocus?.focus?.();
}
modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});

function soundButton() {
  return `<button class="sound-button" data-action="sound" aria-pressed="${isSoundEnabled()}">声音 ${isSoundEnabled() ? "开" : "关"}</button>`;
}
function header() {
  return `<header class="game-header"><button class="wordmark" data-action="menu">未发送的我们<span>MESSAGES WE NEVER SENT</span></button><div class="header-tools"><span class="save-status" id="save-status" title="${esc(status.message)}">${esc(saveLabel())}</span><button class="text-button" data-action="save">保存</button><button class="text-button" data-action="help">帮助</button>${soundButton()}</div></header>`;
}
function saveLabel() {
  if (status.readBlocked) return "读取失败 · 点此重试";
  if (status.saving) return "正在保存";
  if (status.mode === "platform")
    return status.savedAt ? "云端已保存" : "云存档";
  if (status.mode === "local")
    return status.savedAt ? "本机已保存" : "本机存档";
  return "连接未完成";
}
function updateStatus(next) {
  status = next;
  pauseSound(next.paused || next.adBusy || document.hidden);
  if (!initialized) return;
  const label = document.querySelector("#save-status");
  if (label) {
    label.textContent = saveLabel();
    label.title = status.message;
  }
  document.querySelectorAll('[data-action="ad-hint"]').forEach((b) => {
    b.disabled = next.adBusy || !next.adsAvailable;
    b.textContent = next.adBusy ? "正在打开广告" : "看广告 · 加 1 次";
  });
  root.inert = Boolean(next.paused || next.adBusy);
}
async function persist(manual = false) {
  clearTimeout(saveTimer);
  if (!loaded) {
    if (manual) toast("请先重新读取原存档。");
    return false;
  }
  const snapshot = state;
  const ok = await saveProgress(snapshot);
  if (ok) {
    saved = snapshot;
    if (manual)
      toast(status.mode === "platform" ? "已保存到星匣云端" : "已保存在本机");
  } else if (manual) toast(getPlatformStatus().message);
  return ok;
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persist(), 1200);
}
function updateState(next, { renderPage = true, sound = false } = {}) {
  if (next === state) return false;
  state = next;
  if (renderPage) render();
  scheduleSave();
  if (sound) chime();
  return true;
}

function renderCover() {
  return `<main class="cover"><header class="cover-header"><div class="edition">一部关于旧友的互动故事<br>2019 — 2026</div><div class="cover-actions"><button class="text-button" data-action="credits">关于作品</button>${soundButton()}</div></header><section class="cover-main"><div class="cover-kicker">把没说完的那句，留给今天</div><h1>未发送的<br><span>我们</span></h1><div class="cover-english">MESSAGES WE NEVER SENT</div><p class="cover-description">一部重新亮起的旧手机。<br>一场迟了七年的重逢。<br>这一次，我们能不能把话说完。</p><div class="cover-start"><button class="primary" data-action="${saved ? "continue" : "new"}" ${!loaded ? "disabled" : ""}>${saved ? "继续这段回忆" : "打开旧手机"}<span class="arrow">→</span></button>${saved ? '<button class="secondary" data-action="restart">重新开始</button>' : ""}</div>${bootError ? `<div class="error-box">${esc(bootError)}<br><button class="text-button" data-action="retry">重新连接并读取</button></div>` : ""}<div class="cover-meta"><span>5 章调查</span><span>3 种关系的去向</span><span>约 30 分钟</span></div></section><p class="cover-quote">有些话，读懂以后<br>也可以不再发送。</p><footer class="cover-footer"><span>一部旧手机 · 两个人的七年</span><span>${esc(status.mode === "platform" ? "星匣云存档已连接" : "本机存档 · 可随时继续")}</span></footer></main>`;
}

function renderChapter() {
  const chapter = CHAPTERS[state.chapter];
  return `<aside class="chapter-panel"><div class="chapter-top"><div class="small-caps">CHAPTER ${String(state.chapter + 1).padStart(2, "0")} / 05</div><h1>${esc(chapter.title.replace(/^[一二三四五]\s*·\s*/, ""))}</h1><p class="chapter-summary">${esc(chapter.description)}</p><ol class="chapter-timeline" aria-label="章节进度">${CHAPTERS.map((c) => `<li class="${c.id === state.chapter ? "active" : c.id < state.chapter ? "done" : ""}" aria-label="${esc(c.title)}${c.id === state.chapter ? "，当前章" : ""}"></li>`).join("")}</ol><span class="chapter-label">${esc(chapter.kicker)}</span></div><div class="current-task"><div class="eyebrow">眼下值得做的事</div><p>${esc(taskText())}</p><button class="text-button" data-action="open-app" data-id="case">整理这一章的事实 →</button></div><div class="mobile-nav"><button data-action="casebook">线索 ${state.clues.length}/${CLUES.length}</button><button data-action="hint-menu">提示 ${state.hintCredits}</button></div><div class="how-to">你正在查看知夏留下的旧手机。<br>聊天右侧是知夏，左侧是联系人。<br>遇到重要内容，点“收入线索册”。</div></aside>`;
}
function taskText() {
  const chapter = CHAPTERS[state.chapter],
    found = chapter.requiredClues.filter((id) =>
      state.clues.includes(id),
    ).length;
  if (state.finale) return "事实已经齐全。准备好后，回到老站二楼的对话。";
  if (found < chapter.requiredClues.length)
    return `本章已找到 ${found} / ${chapter.requiredClues.length} 条关键回忆。到不同应用里继续寻找。`;
  if (chapterReady(state))
    return state.chapter === 4
      ? "该知道的已经知道了。现在，带着完整的事实去见她。"
      : "这一章的事实已经拼好，可以继续向前。";
  return "关键回忆已齐。打开“推理”，试着把它们连成一句完整的解释。";
}
function clueButton(id) {
  if (!id) return "";
  const clue = getClue(id);
  if (!clue || clue.chapter > state.chapter) return "";
  const collected = state.clues.includes(id);
  return `<button class="clue-action ${collected ? "collected" : ""}" data-action="clue" data-id="${esc(id)}" ${collected ? "disabled" : ""}>${collected ? "已收入线索册" : "收入线索册"} · ${esc(clue.title)}</button>`;
}
function renderCasebook() {
  const p = getProgress(state);
  return `<aside class="casebook-panel"><div class="small-caps">THE THINGS WE KNOW</div><div class="casebook-header"><h2>回忆线索册</h2><span class="case-count">${String(p.found).padStart(2, "0")} / ${p.total}</span></div><div class="progress-track" role="progressbar" aria-valuenow="${p.found}" aria-valuemin="0" aria-valuemax="${p.total}" aria-label="已收集线索"><span style="width:${p.percent}%"></span></div><div class="evidence-list">${
    state.clues.length
      ? state.clues
          .slice()
          .reverse()
          .map((id) => {
            const c = getClue(id);
            return `<button class="evidence-card" data-action="evidence" data-id="${esc(c.id)}"><small>${esc(c.source)}</small><strong>${esc(c.title)}</strong><p>${esc(c.detail)}</p></button>`;
          })
          .join("")
      : '<div class="empty-evidence">那些你以为已经忘掉的事，<br>也许还藏在一张照片背面。<br><br>查阅旧记录，把关键发现<br>留在这里。</div>'
  }</div>${renderHints()}</aside>`;
}
function renderHints() {
  return `<div class="hint-panel"><div class="hint-rule"><span class="small-caps">IF YOU GET LOST</span><p>有些心结，换个角度才看得见。<br>剩余提示 ${state.hintCredits} 次；所有线索都可以直接找到。</p><div class="hint-buttons"><button class="hint-use" data-action="hint" ${state.hintCredits <= 0 ? "disabled" : ""}>找一点方向</button><button class="ad-hint" data-action="ad-hint" ${!status.adsAvailable || status.adBusy ? "disabled" : ""}>${status.adBusy ? "正在打开广告" : "看广告 · 加 1 次"}</button></div><p>${status.mode === "local" ? "广告提示可在星匣内使用。" : status.adsAvailable ? "广告只增加提示，不影响剧情与结局。" : "广告提示暂不可用，仍可继续调查。"}</p></div></div>`;
}
function renderHome() {
  const missing = CLUES.filter(
    (c) => c.chapter === state.chapter && !state.clues.includes(c.id),
  ).length;
  return `<div class="phone-home"><div class="home-clock"><time>16:20</time><p>11 月 14 日 · 星期六</p></div><div class="home-notice"><strong>沈知夏的旧手机</strong><p>${state.finale ? "记录已经看完。那张靠窗的桌子，还有一个今天的座位。" : esc(CHAPTERS[state.chapter].description)}</p></div><div class="app-grid">${appDefs.map(([id, title, index]) => `<button class="app-icon-button" data-action="open-app" data-id="${id}" aria-label="打开${title}"><span class="raster-icon" style="background-position:${(index % 3) * 50}% ${index < 3 ? 0 : 100}%"></span><span class="app-name">${title}</span>${id === "case" ? `<span class="app-badge">${chapterReady(state) ? "续" : missing || "理"}</span>` : ""}</button>`).join("")}</div><p class="home-caption">有些记录，等一句新的回应。</p></div>`;
}
function appHeader() {
  const item = ui.item;
  let title = appDefs.find((a) => a[0] === ui.app)?.[1] || "";
  let sub = "";
  if (ui.app === "messages" && item) {
    const t = THREADS.find((t) => t.id === item);
    title = t.name;
    sub = t.subtitle;
  }
  if (ui.app === "notes" && item) {
    title = "备忘录";
    sub = "一字未改的旧稿";
  }
  if (ui.app === "bills" && item) title = "账单详情";
  return `<div class="phone-app-header"><button class="back-button" data-action="back">${item ? "返回" : "桌面"}</button><div><h2>${esc(title)}</h2>${sub ? `<small>${esc(sub)}</small>` : ""}</div><button class="back-button" data-action="home">首页</button></div>`;
}
function renderThreads() {
  let list = visible(THREADS);
  if (ui.search)
    list = list.filter((t) =>
      `${t.name}${t.subtitle}${t.messages.map((m) => m.text).join("")}`.includes(
        ui.search,
      ),
    );
  return `<div class="searchbar"><input id="chat-search" type="search" placeholder="搜索联系人或聊天内容" aria-label="搜索聊天" value="${esc(ui.search)}" autocomplete="off"></div><div class="list-intro">这些是与放映有关的会话，按恢复档案顺序排列。</div>${list.length ? list.map((t) => `<button class="thread-row" data-action="thread" data-id="${esc(t.id)}">${img(t.avatar, t.name, "avatar")}<div class="thread-meta"><strong>${esc(t.name)}${t.messages.some((m) => m.clueId && !state.clues.includes(m.clueId)) ? '<span class="unread-dot" aria-label="有未收集线索"></span>' : ""}</strong><p>${esc(t.subtitle)}</p></div><span class="thread-time">${t.chapter === state.chapter ? "新恢复" : "已恢复"}</span></button>`).join("") : '<p class="search-empty">没有找到相关会话。</p>'}<div class="list-footer">${visible(THREADS).length} 段会话已恢复 · 后续记录随调查开放</div>`;
}
function renderThread() {
  const t = THREADS.find((t) => t.id === ui.item);
  if (!t || !unlocked(t)) return renderThreads();
  return `<div class="chat-body"><div class="chat-date">${esc(t.subtitle)}</div>${t.messages.map((m) => (m.side === "system" ? `<div class="message system"><span class="system-text">${esc(m.text)}</span></div>` : `<div class="message ${m.side}">${img(m.side === "out" ? "assets/portrait-zhixia.webp" : t.avatar, m.side === "out" ? "沈知夏" : t.name, "avatar")}<div class="bubble-wrap"><div class="bubble">${esc(m.text)}</div><time>${esc(m.time)}</time>${clueButton(m.clueId)}</div></div>`)).join("")}<div class="chat-footer">— 这一段记录到这里结束 —<br>去相册、备忘录与账单看看，还有别的视角。</div></div>`;
}
function renderPhotos() {
  return `<div class="list-intro">${visible(PHOTOS).length} 张共同往事。点开照片，看看背面。</div><div class="photo-grid">${visible(
    PHOTOS,
  )
    .map(
      (p) =>
        `<button class="photo-tile" data-action="photo" data-id="${esc(p.id)}">${img(p.asset, p.title)}<span class="photo-overlay"><strong>${esc(p.title)}</strong><span>${esc(p.date.split(" ")[0])}</span></span>${p.clueId && !state.clues.includes(p.clueId) ? '<span class="tile-mark">有背记</span>' : ""}</button>`,
    )
    .join(
      "",
    )}</div><div class="list-footer">有些答案，没有拍在照片的正面。</div>`;
}
function renderNotes() {
  if (ui.item) {
    const n = NOTES.find((n) => n.id === ui.item);
    if (n && unlocked(n))
      return `<article class="note-paper"><h3>${esc(n.title)}</h3><time>${esc(n.date)}</time><div class="note-text">${esc(n.body)}</div>${clueButton(n.clueId)}</article>`;
  }
  return `<div class="list-intro">没有发出的消息，也算是当时的一部分。</div><div class="document-list">${visible(
    NOTES,
  )
    .map(
      (n) =>
        `<button class="note-row" data-action="note" data-id="${esc(n.id)}"><strong>${esc(n.title)}${n.clueId && !state.clues.includes(n.clueId) ? '<span class="unread-dot"></span>' : ""}</strong><p>${esc(n.body.replace(/\n/g, " "))}</p><time>${esc(n.date)}</time></button>`,
    )
    .join(
      "",
    )}</div><div class="list-footer">${visible(NOTES).length} 份手记 · 原文保留</div>`;
}
const money = (value) =>
  Number(value).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
function renderBills() {
  if (ui.item) {
    const t = TRANSACTIONS.find((t) => t.id === ui.item);
    if (t && unlocked(t))
      return `<article class="receipt"><h3 class="receipt-title">${esc(t.title)}</h3><div class="receipt-amount">${t.kind === "in" ? "+" : "−"} ${money(t.amount)}</div><dl><dt>交易状态</dt><dd>${esc(t.status)}</dd><dt>记录日期</dt><dd>${esc(t.date)}</dd><dt>收支方向</dt><dd>${t.kind === "in" ? "转入知夏账户" : "由知夏账户转出"}</dd></dl><p class="detail">${esc(t.detail)}</p>${clueButton(t.clueId)}</article>`;
  }
  return `<div class="transaction-head"><strong>雨声放映计划 · 相关账目</strong><p>2019 <span style="font:12px sans-serif">—</span> 2026</p><small>这里只显示共同事件的记录，不是完整余额。</small></div>${visible(
    TRANSACTIONS,
  )
    .map(
      (t) =>
        `<button class="transaction-row" data-action="bill" data-id="${esc(t.id)}"><strong>${esc(t.title)}${t.clueId && !state.clues.includes(t.clueId) ? '<span class="unread-dot"></span>' : ""}</strong><span class="amount">${t.kind === "in" ? "+" : "−"}${money(t.amount)}</span><small>${esc(t.date)}</small><small>${esc(t.status)}</small></button>`,
    )
    .join(
      "",
    )}<div class="list-footer">钱会退回原处。信任需要另外的回答。</div>`;
}
function renderVoice() {
  const transcript = NOTES.find((n) => n.id === "n3-audio");
  return `<div class="recording-card">${img("assets/photo-recorder.webp", "记录过街坊声音的便携录音机", "recording-art")}<span class="small-caps" style="color:#947a50">THE SOUND OF WHAT REMAINS</span><h3>把雨声听完</h3><p>${state.chapter < 3 ? "这台机器曾记录你们共同生活的小城。原始录音的恢复记录仍在后面的档案里。" : "原始四小时素材没有完整找回。这里保留的是恢复记录的文字；雨声试听是对当年环境的声音复原。"}</p><div class="voice-bars ${ui.recording ? "" : "paused"}" aria-hidden="true">${Array.from({ length: 38 }, (_, i) => `<i style="height:${9 + ((i * 17 + 11) % 25)}px;animation-delay:${(i % 6) * 0.09}s"></i>`).join("")}</div><div class="recording-controls"><button data-action="recording">${ui.recording ? "停止试听" : "试听雨声"}</button><small>环境声复原 · 00:18</small></div>${state.chapter >= 3 && transcript ? `<p style="border-top:1px solid #b7c4a9;padding-top:18px;margin-top:22px">${esc(transcript.body)}</p><button class="clue-action" data-action="note" data-id="n3-audio">查阅恢复记录</button>` : '<p class="quiet">没有补全的部分，不假装已经回来。</p>'}</div>`;
}
function renderPuzzle(p) {
  const solved = state.solved.includes(p.id);
  const hasEvidence = p.requiredClues.every((id) => state.clues.includes(id));
  let input = "";
  if (!solved) {
    if (p.kind === "code")
      input = `<label class="quiet" for="puzzle-code">档案密码</label><input id="puzzle-code" class="puzzle-code" inputmode="numeric" maxlength="12" autocomplete="off" placeholder="四位月日" value="${esc(ui.answer || "")}" ${!hasEvidence ? "disabled" : ""}>`;
    else
      input = p.options
        .map((option, index) => {
          const order = ui.order.indexOf(option.id);
          return `<button class="puzzle-choice ${ui.answer === option.id || order >= 0 ? "selected" : ""}" data-action="answer" data-id="${esc(option.id)}" ${!hasEvidence ? "disabled" : ""}>${p.kind === "order" ? `<span class="order-number">${order < 0 ? "·" : order + 1}</span>` : ""}${esc(option.text)}</button>`;
        })
        .join("");
  }
  return `<div class="puzzle-card"><h4>${esc(p.title)}</h4><p>${esc(p.prompt)}</p>${!hasEvidence ? '<p class="quiet">先把上方的关键回忆收入线索册，才能作出这次推理。</p>' : ""}${input}${!solved ? `<button class="puzzle-submit" data-action="solve" data-id="${esc(p.id)}" ${!hasEvidence ? "disabled" : ""}>${p.kind === "order" ? "确认事件顺序" : "确认这次推理"}</button>${p.kind === "order" ? '<button class="text-button" data-action="reset-order" style="color:#7d8e6c">重新排列</button>' : ""}` : ""}${solved ? `<div class="puzzle-feedback success">已还原<br>${esc(p.explanation)}</div>` : ui.feedback ? `<div class="puzzle-feedback" role="status">${esc(ui.feedback)}</div>` : ""}</div>`;
}
function renderCase() {
  const c = CHAPTERS[state.chapter],
    p = PUZZLES.find((p) => p.id === c.puzzleId);
  return `<div class="casefile"><span class="small-caps">CHAPTER ${state.chapter + 1} / 5</span><h3>${esc(c.title)}</h3><p class="chapter-deck">${esc(c.description)}</p><ul class="checklist">${c.requiredClues.map((id) => `<li><span class="checkmark ${state.clues.includes(id) ? "checked" : ""}">${state.clues.includes(id) ? "已" : ""}</span><span>${esc(getClue(id).title)}</span></li>`).join("")}</ul>${p ? renderPuzzle(p) : '<p class="chapter-deck">这一次没有密码，也没有标准答案。把最后的四条回忆看完，接下来由今天的你回答。</p>'}<button class="next-chapter" data-action="advance" ${!chapterReady(state) ? "disabled" : ""}>${state.finale ? "回到重逢对话" : state.chapter === 4 ? "去见今天的她" : "继续下一章"}<span class="arrow">→</span></button><p class="list-footer">${chapterReady(state) ? "你可以随时回看已经恢复的记录。" : "关键回忆和本章推理完成后，新的记录会开放。"}</p></div>`;
}
function renderPhone() {
  let content = "";
  if (ui.app === "home") content = renderHome();
  if (ui.app === "messages")
    content = ui.item ? renderThread() : renderThreads();
  if (ui.app === "photos") content = renderPhotos();
  if (ui.app === "notes") content = renderNotes();
  if (ui.app === "bills") content = renderBills();
  if (ui.app === "voice") content = renderVoice();
  if (ui.app === "case") content = renderCase();
  return `<section class="phone" aria-label="沈知夏的旧手机"><div class="phone-display"><div class="statusbar"><time>16:20</time><span class="speaker" aria-hidden="true"></span><span class="status-signal">${ui.app === "home" ? "旧记录已恢复" : "青岚"} · 84%</span></div>${ui.app === "home" ? "" : appHeader()}<div class="app-body" id="phone-body" tabindex="-1">${content}</div><button class="phone-bottom" data-action="home" aria-label="回到手机桌面"><span class="home-indicator"></span></button></div></section>`;
}
function renderWorkspace() {
  return `<main class="workspace">${header()}<div class="work-grid">${renderChapter()}${renderPhone()}${renderCasebook()}</div><footer class="workspace-footer"><span>2019 / 那些没有说完的话</span><span>${state.finale ? '<button class="text-button" data-action="resume-story">回到重逢 →</button>' : "先看见事实，再决定如何开口。"}</span></footer></main>`;
}
function renderFinale() {
  const round = FINALE.rounds[state.dialogueIndex];
  const response = ui.response;
  const last = state.dialogueIndex >= FINALE.rounds.length;
  return `<main class="finale">${header()}<section class="finale-main"><div class="finale-kicker">2026 · 青岚老站二楼 · 16:20</div><div class="dialogue-panel"><div class="dialogue-speaker">${img("assets/portrait-zhixia.webp", "沈知夏")}<span>${esc(response ? "沈知夏" : round?.speaker || "沈知夏")}</span></div><div class="dialogue-text">${esc(response || round?.text || FINALE.intro)}</div></div><div class="dialogue-choices">${response ? `<button class="dialogue-choice" data-action="dialogue-next">${last ? "把这场对话带到以后" : "听她继续说"}<span class="arrow">→</span></button>` : round ? round.choices.map((c, i) => `<button class="dialogue-choice" data-action="dialogue" data-round="${esc(round.id)}" data-id="${esc(c.id)}"><span>0${i + 1}</span>${esc(c.text)}</button>`).join("") : ""}</div><div class="dialogue-progress" aria-label="已完成${state.dialogueIndex}轮对话">${FINALE.rounds.map((_, i) => `<span class="${i < state.dialogueIndex ? "done" : ""}"></span>`).join("")}</div><button class="text-button" data-action="review">回看旧手机里的事实</button></section></main>`;
}
function renderEnding() {
  const key = getEnding(state),
    e = ENDINGS[key];
  if (!e) return renderFinale();
  const index = ["reconnect", "distance", "farewell"].indexOf(key) + 1;
  return `<main class="ending-screen">${img(e.asset, e.title, "ending-art")}${header()}<article class="ending-content"><span class="ending-number">END ${String(index).padStart(2, "0")} / 03 · 我们决定的以后</span><h1>${esc(e.title)}</h1><p class="ending-subtitle">${esc(e.subtitle)}</p><div class="ending-story">${esc(e.text)}</div><div class="ending-actions"><button class="primary" data-action="ending-letter">读一封后来的信</button><button class="secondary" data-action="review">回看这段往事</button><button class="secondary" data-action="replay-dialogue">再说一次</button></div><p class="quiet" style="margin-top:25px">${esc(GAME.closing)}</p></article></main>`;
}
function render({ preserveScroll = true } = {}) {
  setMusicScene(ui.screen === "ending" ? "ending" : ui.screen === "finale" ? "reunion" : "investigation");
  const old = document.querySelector("#phone-body");
  const scroll = old?.scrollTop || 0;
  root.innerHTML =
    ui.screen === "cover"
      ? renderCover()
      : ui.screen === "finale"
        ? renderFinale()
        : ui.screen === "ending"
          ? renderEnding()
          : renderWorkspace();
  root.classList.toggle("reading-mode", readable);
  if (preserveScroll && document.querySelector("#phone-body"))
    document.querySelector("#phone-body").scrollTop = scroll;
  updateStatus(status);
}

function openApp(id) {
  stopRecording();
  ui.app = id;
  ui.item = null;
  ui.search = "";
  ui.answer = null;
  ui.order = [];
  ui.feedback = null;
  render({ preserveScroll: false });
}
function showIntro() {
  showModal(
    "一封寄给今天的信",
    `<article class="intro-letter" style="padding:10px;background:none;box-shadow:none"><span class="small-caps">QINGLAN · NOVEMBER 2026</span><h2>周遥，<br>手机修好了。</h2>${GAME.intro
      .slice(0, 3)
      .map((p) => `<p>${esc(p)}</p>`)
      .join(
        "",
      )}<p class="intro-sign">沈知夏<br>2026 年 11 月</p><button class="primary" data-action="begin">把手机重新打开</button></article>`,
  );
}
function startNew() {
  if (!loaded) {
    toast("请先读取原存档。");
    return;
  }
  state = createState();
  ui = {
    screen: "cover",
    app: "home",
    item: null,
    search: "",
    answer: null,
    order: [],
    feedback: null,
    response: null,
    recording: false,
  };
  showIntro();
}
function resumeStory() {
  ui.response = null;
  ui.screen = getEnding(state) ? "ending" : state.finale ? "finale" : "phone";
  render({ preserveScroll: false });
}
function showCasebook() {
  showModal(
    "回忆线索册",
    `<span class="small-caps">${state.clues.length} / ${CLUES.length} THINGS WE KNOW</span>${
      state.clues.length
        ? state.clues
            .map((id) => {
              const c = getClue(id);
              return `<article class="modal-evidence"><h4>${esc(c.title)}</h4><p>${esc(c.source)}</p><p>${esc(c.detail)}</p></article>`;
            })
            .join("")
        : '<div class="empty-evidence">查阅手机里的记录，点“收入线索册”，你的发现就会留在这里。</div>'
    }<button class="primary" data-action="goto-case">整理本章事实</button>`,
  );
}
function hintMenu() {
  showModal(
    "找一点方向",
    `${renderHints()}<p class="quiet">提示只指向尚未找到的记录。你也可以自己继续查找，不影响任何结局。</p>`,
  );
}
function useHint() {
  const result = consumeHint(state);
  if (!result.hint) {
    toast("当前没有剩余提示，可以继续查找记录。");
    return;
  }
  updateState(result.state);
  showModal(
    "一条小小的提醒",
    `<h3>${esc(result.hint.title)}</h3><p>${esc(result.hint.text)}</p>${result.hint.clueId ? `<button class="primary" data-action="hint-source" data-id="${esc(result.hint.clueId)}">去这个应用看看</button>` : result.hint.puzzleId ? '<button class="primary" data-action="goto-case">回到推理页</button>' : ""}<p class="quiet">剩余 ${state.hintCredits} 次提示</p>`,
  );
}
function goToClue(id) {
  let item = PHOTOS.find((p) => p.clueId === id);
  if (item) {
    openApp("photos");
    return;
  }
  item = NOTES.find((n) => n.clueId === id);
  if (item) {
    ui.app = "notes";
    ui.item = item.id;
    render({ preserveScroll: false });
    return;
  }
  item = TRANSACTIONS.find((t) => t.clueId === id);
  if (item) {
    ui.app = "bills";
    ui.item = item.id;
    render({ preserveScroll: false });
    return;
  }
  item = THREADS.find((t) => t.messages.some((m) => m.clueId === id));
  if (item) {
    ui.app = "messages";
    ui.item = item.id;
    render({ preserveScroll: false });
    return;
  }
  openApp("case");
}
async function requestAd() {
  if (requestingAd) return;
  closeModal();
  requestingAd = true;
  clearTimeout(saveTimer);
  stopRecording();
  const previousSound = isSoundEnabled();
  pauseSound(true);
  try {
    const result = await showRewardedHint({
      onReward: async ({ requestId }) => {
        const draft = grantHint(state, requestId);
        if (!(await saveProgress(draft))) throw new Error("提示尚未保存");
        state = draft;
        saved = draft;
      },
    });
    render();
    if (result.rewarded) {
      chime();
      showModal(
        "多了一点方向",
        `<h3>${result.alreadyGranted ? "这次提示已经领取" : "提示已增加 1 次"}</h3><p>当前有 ${state.hintCredits} 次提示。所有回忆仍然留在原来的地方，等你自己读懂。</p><button class="primary" data-action="hint">使用一次提示</button>`,
      );
    } else toast(result.reason || "这次没有完成广告，提示次数未改变。");
  } catch {
    toast("广告暂时未完成，提示次数未改变。");
  } finally {
    requestingAd = false;
    pauseSound(status.paused || status.adBusy || document.hidden);
    if (previousSound && !isSoundEnabled()) await setSound(true);
  }
}
function stopRecording() {
  if (!ui.recording) return;
  ui.recording = false;
  clearTimeout(archiveEnd);
  stopArchive();
}
function settings() {
  showModal(
    "阅读与声音",
    `<h3>按自己的节奏读完</h3><p>重要选择与线索会自动保存。你也可以随时点击顶部“保存”。</p><div class="button-row"><button class="secondary" data-action="sound">声音：${isSoundEnabled() ? "已开启" : "已关闭"}</button><button class="secondary" data-action="readable">字号：${readable ? "放大" : "标准"}</button></div><p class="quiet">${esc(status.message)}</p><button class="text-button" style="color:#788b70" data-action="retry">重新连接存档</button><p class="quiet">配乐随调查、重逢与结局切换，可随时关闭。雨声只在“声音”应用中试听。</p>`,
  );
}
function credits() {
  showModal(
    "关于这部作品",
    `<span class="small-caps">MESSAGES WE NEVER SENT</span><h3>未发送的我们</h3><p>一部关于友情、误会与重新开口的中文原创互动故事。以旧手机调查和聊天叙事为灵感，角色、剧情、对白与美术均为本作创作。</p><p>5 章调查 · 20 条关键回忆 · 4 道推理<br>6 轮重逢对话 · 3 种关系的去向</p><p class="quiet">美术：AI 生成的电影胶片风格图片<br>配乐：Stable Audio 生成的三首主题曲<br>音效：独立雨声与交互提示音<br>主线及全部结局免费，广告仅增加可选提示。</p><div class="button-row"><button class="secondary" data-action="settings">阅读与声音</button><button class="secondary" data-action="help">怎样游玩</button></div>`,
  );
}
function help() {
  showModal(
    "怎样读懂这部旧手机",
    `<h3>先看见，再开口。</h3><ol class="help-steps"><li>从手机桌面进入聊天、相册、备忘录和账单。</li><li>打开记录，点“收入线索册”留下关键发现。</li><li>每章找到四条回忆后，进入“推理”拼出事实。</li><li>完成推理，恢复下一章的记录。第五章后进入重逢。</li><li>对话没有“必须和好”的答案，选择今天的你想说的话。</li></ol><p class="modal-note">你扮演周遥，查看的是沈知夏留下的手机。聊天右侧为知夏，左侧为联系人。照片的背记、账单的详情与聊天同样重要。</p><div class="button-row"><button class="secondary" data-action="hint-menu">找一点方向</button><button class="secondary" data-action="settings">阅读与声音</button></div>`,
  );
}
async function retryLoad() {
  closeModal();
  bootError = "";
  try {
    await initPlatform({ onStatus: updateStatus, retry: true });
    const raw = await loadProgress();
    saved = raw ? restoreState(raw) : null;
    if (raw) state = saved;
    loaded = true;
    toast("存档已重新读取");
  } catch (error) {
    loaded = false;
    bootError = error.message;
    toast(error.message);
  }
  render();
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;
  const action = button.dataset.action,
    id = button.dataset.id;
  if (status.adBusy || status.paused) return;
  if (action !== "sound") void unlockSound();
  if (action === "close") {
    closeModal();
    return;
  }
  if (action === "sound") {
    await setSound(!isSoundEnabled());
    if (modal.open && modal.textContent.includes("阅读与声音")) settings();
    render();
    return;
  }
  if (action === "new") {
    startNew();
    return;
  }
  if (action === "continue") {
    state = restoreState(saved);
    resumeStory();
    return;
  }
  if (action === "restart") {
    showModal(
      "重新打开这段回忆",
      `<h3>从第一章开始</h3><p>这会用新的调查进度覆盖当前存档。已经看过的故事，可以从另一个角度再读一遍。</p><div class="button-row"><button class="primary" data-action="new">重新开始</button><button class="secondary" data-action="close">保留当前进度</button></div>`,
    );
    return;
  }
  if (action === "begin") {
    closeModal();
    ui.screen = "phone";
    ui.app = "home";
    ui.item = null;
    render({ preserveScroll: false });
    await persist();
    return;
  }
  if (action === "menu") {
    await persist();
    ui.screen = "cover";
    closeModal();
    render();
    return;
  }
  if (action === "save") {
    await persist(true);
    return;
  }
  if (action === "help") {
    help();
    return;
  }
  if (action === "credits") {
    credits();
    return;
  }
  if (action === "settings") {
    settings();
    return;
  }
  if (action === "readable") {
    readable = !readable;
    settings();
    render();
    return;
  }
  if (action === "retry") {
    await retryLoad();
    return;
  }
  if (action === "open-app") {
    openApp(id);
    return;
  }
  if (action === "home") {
    openApp("home");
    return;
  }
  if (action === "back") {
    stopRecording();
    if (ui.item) {
      ui.item = null;
      render({ preserveScroll: false });
    } else openApp("home");
    return;
  }
  if (action === "thread") {
    if (!THREADS.some((t) => t.id === id && unlocked(t))) return;
    ui.item = id;
    render({ preserveScroll: false });
    return;
  }
  if (action === "note") {
    if (!NOTES.some((n) => n.id === id && unlocked(n))) return;
    ui.app = "notes";
    ui.item = id;
    render({ preserveScroll: false });
    return;
  }
  if (action === "bill") {
    if (!TRANSACTIONS.some((t) => t.id === id && unlocked(t))) return;
    ui.item = id;
    render({ preserveScroll: false });
    return;
  }
  if (action === "photo") {
    const p = PHOTOS.find((p) => p.id === id && unlocked(p));
    if (p)
      showModal(
        "照片背面的字",
        `${img(p.asset, p.title, "photo-full")}<span class="small-caps">${esc(p.date)}</span><h3 style="margin-top:12px">${esc(p.title)}</h3><p>${esc(p.caption)}</p>${clueButton(p.clueId)}`,
      );
    return;
  }
  if (action === "clue") {
    if (updateState(collectClue(state, id), { sound: true })) {
      toast("已收入线索册：" + getClue(id).title);
      if (modal.open) {
        const b = modal.querySelector('[data-action="clue"]');
        if (b) {
          b.disabled = true;
          b.classList.add("collected");
          b.textContent = "已收入线索册 · " + getClue(id).title;
        }
      }
    }
    return;
  }
  if (action === "evidence") {
    const c = getClue(id);
    if (c && state.clues.includes(id))
      showModal(
        "一条已经确认的回忆",
        `<span class="small-caps">${esc(c.source)}</span><h3 style="margin-top:15px">${esc(c.title)}</h3><p>${esc(c.detail)}</p><button class="secondary" data-action="hint-source" data-id="${esc(id)}">回看原始记录</button>`,
      );
    return;
  }
  if (action === "casebook") {
    showCasebook();
    return;
  }
  if (action === "goto-case") {
    closeModal();
    ui.screen = "phone";
    openApp("case");
    return;
  }
  if (action === "hint-menu") {
    hintMenu();
    return;
  }
  if (action === "hint") {
    useHint();
    return;
  }
  if (action === "hint-source") {
    closeModal();
    ui.screen = "phone";
    goToClue(id);
    return;
  }
  if (action === "ad-hint") {
    await requestAd();
    return;
  }
  if (action === "answer") {
    const p = PUZZLES.find((p) => p.id === CHAPTERS[state.chapter].puzzleId);
    if (!p) return;
    if (p.kind === "order") {
      ui.order = ui.order.includes(id)
        ? ui.order.filter((x) => x !== id)
        : [...ui.order, id];
    } else ui.answer = id;
    ui.feedback = null;
    render();
    return;
  }
  if (action === "reset-order") {
    ui.order = [];
    ui.feedback = null;
    render();
    return;
  }
  if (action === "solve") {
    const p = PUZZLES.find((p) => p.id === id);
    const answer =
      p.kind === "code"
        ? document.querySelector("#puzzle-code")?.value
        : p.kind === "order"
          ? ui.order
          : ui.answer;
    if (
      !answer ||
      (Array.isArray(answer) && answer.length !== p.options.length)
    ) {
      ui.feedback =
        p.kind === "order"
          ? "按顺序点选全部事件，再确认。"
          : "先写下或选择你的推理。";
      render();
      return;
    }
    const result = solvePuzzle(state, id, answer);
    state = result.state;
    ui.feedback = result.message;
    render();
    scheduleSave();
    if (result.ok) {
      chime();
      toast("这一段往事，终于有了完整的顺序。");
    }
    return;
  }
  if (action === "advance") {
    if (state.finale) {
      resumeStory();
      return;
    }
    const next = advanceChapter(state);
    if (next === state) return;
    state = next;
    ui.answer = null;
    ui.order = [];
    ui.feedback = null;
    scheduleSave();
    if (state.finale) {
      showModal(
        "那张靠窗的桌子",
        `<h3>今天，不是2019年。</h3><p>${esc(FINALE.intro)}</p><button class="primary" data-action="resume-story">走上老站二楼</button>`,
      );
    } else {
      openApp("home");
      showModal(
        `第 ${state.chapter + 1} 章 · 新的记录`,
        `<span class="small-caps">${esc(CHAPTERS[state.chapter].kicker)}</span><h3 style="margin-top:15px">${esc(CHAPTERS[state.chapter].title)}</h3><p>${esc(CHAPTERS[state.chapter - 1].unlockText)}</p><p class="quiet">聊天、相册、备忘录与账单中恢复了新的内容。</p><button class="primary" data-action="close">继续查阅</button>`,
      );
    }
    return;
  }
  if (action === "resume-story") {
    closeModal();
    resumeStory();
    return;
  }
  if (action === "dialogue") {
    const result = chooseDialogue(state, button.dataset.round, id);
    if (!result.ok) return;
    state = result.state;
    ui.response = result.response;
    scheduleSave();
    render({ preserveScroll: false });
    return;
  }
  if (action === "dialogue-next") {
    ui.response = null;
    if (getEnding(state)) {
      ui.screen = "ending";
      chime();
    }
    render({ preserveScroll: false });
    return;
  }
  if (action === "review") {
    ui.screen = "phone";
    openApp("home");
    return;
  }
  if (action === "ending-letter") {
    const e = ENDINGS[getEnding(state)];
    showModal(
      "一封后来的信",
      `<span class="small-caps">AFTER THE CONVERSATION</span><h3 style="margin-top:16px">${esc(e.subtitle)}</h3><p class="serif">${esc(e.letter)}</p><button class="primary" data-action="close">把信收好</button>`,
    );
    return;
  }
  if (action === "replay-dialogue") {
    showModal(
      "再说一次",
      `<h3>从重逢的第一句话开始</h3><p>保留全部调查记录，重新选择六轮对话。新的结果会覆盖本次结局。</p><button class="primary" data-action="replay-confirm">重新开口</button>`,
    );
    return;
  }
  if (action === "replay-confirm") {
    closeModal();
    state = restoreState({ ...state, choices: [] });
    ui.response = null;
    ui.screen = "finale";
    render({ preserveScroll: false });
    scheduleSave();
    return;
  }
  if (action === "recording") {
    if (ui.recording) {
      stopRecording();
      render();
    } else {
      ui.recording = true;
      await playArchive();
      render();
      archiveEnd = setTimeout(() => {
        stopRecording();
        render();
      }, 18000);
    }
    return;
  }
});
document.addEventListener("input", (event) => {
  if (event.target.id === "puzzle-code") ui.answer = event.target.value;
  if (event.target.id === "chat-search") {
    const el = event.target,
      caret = el.selectionStart;
    ui.search = el.value;
    render();
    const field = document.querySelector("#chat-search");
    field?.focus();
    try {
      field?.setSelectionRange(caret, caret);
    } catch {}
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && document.activeElement?.id === "puzzle-code") {
    event.preventDefault();
    document.querySelector('[data-action="solve"]')?.click();
  }
});
document.addEventListener("visibilitychange", () => {
  pauseSound(document.hidden || status.paused || status.adBusy);
  if (document.hidden && loaded && ui.screen !== "cover") persist();
});
document.addEventListener("click", (event) => {
  if (event.target.closest("#save-status") && status.readBlocked) retryLoad();
});
async function boot() {
  try {
    await initPlatform({ onStatus: updateStatus });
    const raw = await loadProgress();
    saved = raw ? restoreState(raw) : null;
    if (saved) state = saved;
    loaded = true;
  } catch (error) {
    bootError = error.message;
    loaded = false;
  }
  initialized = true;
  render({ preserveScroll: false });
}
boot();

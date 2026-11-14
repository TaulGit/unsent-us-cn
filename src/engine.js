import { CHAPTERS, CLUES, FINALE, PUZZLES } from './story.js';

const clueById = new Map(CLUES.map((clue) => [clue.id, clue]));
const puzzleById = new Map(PUZZLES.map((puzzle) => [puzzle.id, puzzle]));
const chapterById = new Map(CHAPTERS.map((chapter) => [chapter.id, chapter]));
const rounds = FINALE.rounds;
const lastChapter = CHAPTERS.length - 1;
const scoreKeys = ['empathy', 'boundary', 'honesty'];

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const unique = (items) => [...new Set(items)];
const hasClues = (state, ids = []) => ids.every((id) => state.clues.includes(id));
const validRequestId = (id) => typeof id === 'string' && id.length > 0 && id.length <= 200 && id === id.trim();
const timestamp = (value, fallback) => Number.isFinite(value) && value >= 0 ? value : fallback;
const touch = (state, patch) => ({ ...state, ...patch, updatedAt: Math.max(Date.now(), state.updatedAt) });
const normalizeCode = (value) => typeof value === 'string' || typeof value === 'number'
  ? String(value).normalize('NFKC').replace(/\s+/g, '').toLowerCase()
  : null;

export function createState(now = Date.now()) {
  const time = timestamp(now, Date.now());
  return {
    version: 1,
    chapter: 0,
    clues: [],
    solved: [],
    attempts: {},
    finale: false,
    dialogueIndex: 0,
    choices: [],
    scores: { empathy: 0, boundary: 0, honesty: 0 },
    ending: null,
    hintCredits: 2,
    rewardIds: [],
    createdAt: time,
    updatedAt: time,
  };
}

/** Recover only progress justified by the preceding chapters and valid evidence. */
export function restoreState(input) {
  if (!isRecord(input) || input.version !== 1) return createState();
  const initial = createState();
  const requestedChapter = Number.isInteger(input.chapter)
    ? Math.min(Math.max(input.chapter, 0), lastChapter) : 0;
  const savedClues = unique(Array.isArray(input.clues) ? input.clues : []).filter((id) => clueById.has(id));
  const savedSolved = new Set(Array.isArray(input.solved) ? input.solved : []);
  let restored = { ...initial, createdAt: timestamp(input.createdAt, initial.createdAt) };

  for (let chapter = 0; chapter <= requestedChapter; chapter += 1) {
    restored.chapter = chapter;
    restored.clues = savedClues.filter((id) => clueById.get(id).chapter <= chapter);
    const chapterPuzzle = chapterById.get(chapter)?.puzzleId;
    const puzzle = puzzleById.get(chapterPuzzle);
    if (puzzle && savedSolved.has(puzzle.id) && hasClues(restored, puzzle.requiredClues)) {
      restored.solved.push(puzzle.id);
    }
    // A claimed later chapter cannot bypass an incomplete preceding chapter.
    if (chapter === requestedChapter || !chapterReady(restored)) break;
  }

  if (isRecord(input.attempts)) {
    for (const puzzle of PUZZLES) {
      const count = input.attempts[puzzle.id];
      if (puzzle.chapter <= restored.chapter && Number.isSafeInteger(count) && count >= 0) {
        restored.attempts[puzzle.id] = count;
      }
    }
  }
  restored.finale = input.finale === true && restored.chapter === lastChapter && chapterReady(restored);
  // Replaying choices prevents forged scores, ending keys, or dialogue indices.
  if (restored.finale && Array.isArray(input.choices)) {
    for (let index = 0; index < Math.min(input.choices.length, rounds.length); index += 1) {
      const choice = input.choices[index];
      if (!isRecord(choice)) break;
      const result = chooseDialogue(restored, choice.roundId, choice.choiceId);
      if (!result.ok) break;
      restored = result.state;
    }
  }
  if (Number.isSafeInteger(input.hintCredits) && input.hintCredits >= 0) {
    restored.hintCredits = input.hintCredits;
  }
  restored.rewardIds = unique(Array.isArray(input.rewardIds) ? input.rewardIds : [])
    .filter(validRequestId).slice(-30);
  restored.updatedAt = Math.max(restored.createdAt, timestamp(input.updatedAt, restored.createdAt));
  return restored;
}

export function collectClue(state, id) {
  const clue = clueById.get(id);
  if (!clue || clue.chapter > state.chapter || state.clues.includes(id)) return state;
  return touch(state, { clues: [...state.clues, id] });
}

export function checkAnswer(puzzleId, answer) {
  const puzzle = puzzleById.get(puzzleId);
  if (!puzzle) return false;
  if (puzzle.kind === 'code') {
    const code = normalizeCode(answer);
    return code !== null && code === normalizeCode(puzzle.solution);
  }
  if (puzzle.kind === 'choice') {
    return typeof answer === 'string' && puzzle.options.some((option) => option.id === answer)
      && answer === puzzle.solution;
  }
  if (puzzle.kind === 'order') {
    return Array.isArray(answer) && Array.isArray(puzzle.solution)
      && answer.length === puzzle.solution.length
      && new Set(answer).size === answer.length
      && answer.every((id, index) => typeof id === 'string' && id === puzzle.solution[index]);
  }
  return false;
}

export function solvePuzzle(state, id, answer) {
  const puzzle = puzzleById.get(id);
  const chapter = chapterById.get(state.chapter);
  if (!puzzle || puzzle.chapter !== state.chapter || chapter?.puzzleId !== id || state.finale) {
    return { state, ok: false, message: '这条推理还没有开放。' };
  }
  if (state.solved.includes(id)) {
    return { state, ok: true, message: puzzle.explanation };
  }
  if (!hasClues(state, puzzle.requiredClues)) {
    return { state, ok: false, message: '还有关键证据没有查阅，先把线索找齐。' };
  }
  const ok = checkAnswer(id, answer);
  const updated = touch(state, {
    attempts: { ...state.attempts, [id]: (state.attempts[id] ?? 0) + 1 },
    ...(ok ? { solved: [...state.solved, id] } : {}),
  });
  return {
    state: updated,
    ok,
    message: ok ? puzzle.explanation : '这份解释和现有证据还对不上。可以回看线索，或使用提示。',
  };
}

export function chapterReady(state) {
  const chapter = chapterById.get(state.chapter);
  return Boolean(chapter && hasClues(state, chapter.requiredClues)
    && (!chapter.puzzleId || state.solved.includes(chapter.puzzleId)));
}

export function advanceChapter(state) {
  if (state.finale || !chapterReady(state)) return state;
  return state.chapter === lastChapter
    ? touch(state, { finale: true })
    : touch(state, { chapter: state.chapter + 1 });
}

function endingFromScores(scores) {
  if (scores.empathy >= 6 && scores.honesty >= 5) return 'reconnect';
  if (scores.empathy <= 1) return 'farewell';
  return 'distance';
}

function endingFromChoices(scores, choices) {
  const finalChoice = choices.at(-1);
  // Respect the player's explicit present-day decision, including after a warm conversation.
  if (finalChoice?.roundId === rounds.at(-1).id) {
    if (finalChoice.choiceId === 'r6-goodbye') return 'farewell';
    if (finalChoice.choiceId === 'r6-distance') return 'distance';
  }
  return endingFromScores(scores);
}

export function chooseDialogue(state, roundId, choiceId) {
  const round = rounds[state.dialogueIndex];
  if (!state.finale || !round || round.id !== roundId || state.ending) {
    return { state, ok: false, response: '请先完成眼前这段对话。' };
  }
  const choice = round.choices.find((item) => item.id === choiceId);
  if (!choice) return { state, ok: false, response: '这句话不在当前选项中。' };
  const scores = Object.fromEntries(scoreKeys.map((key) => [
    key, state.scores[key] + (Number.isFinite(choice.effects?.[key]) ? choice.effects[key] : 0),
  ]));
  const dialogueIndex = state.dialogueIndex + 1;
  const choices = [...state.choices, { roundId, choiceId }];
  return {
    state: touch(state, {
      scores,
      dialogueIndex,
      choices,
      ending: dialogueIndex === rounds.length ? endingFromChoices(scores, choices) : null,
    }),
    ok: true,
    response: choice.response,
  };
}

export function getEnding(state) {
  return state.finale && state.dialogueIndex === rounds.length
    ? endingFromChoices(state.scores, state.choices) : null;
}

export function getProgress(state) {
  const found = unique(state.clues).filter((id) => clueById.has(id)).length;
  const total = CLUES.length;
  return { found, total, percent: total ? Math.round(found / total * 100) : 100, chapter: state.chapter, chapters: CHAPTERS.length };
}

export function nextHint(state) {
  if (getEnding(state)) return { title: '故事已经抵达终点', text: '你可以回看证据与结局，或重新开始另一段选择。' };
  if (state.finale) return { title: '把话说完整', text: '证据已经齐了。接下来，试着同时表达理解、真实感受与自己的边界。' };
  const chapter = chapterById.get(state.chapter);
  const missingId = chapter.requiredClues.find((id) => !state.clues.includes(id));
  if (missingId) {
    const clue = clueById.get(missingId);
    return { title: `还有一处值得看看：${clue.title}`, text: `去「${clue.source}」查找这条线索，留意与本章事件相关的细节。`, clueId: missingId };
  }
  const puzzle = puzzleById.get(chapter.puzzleId);
  if (puzzle && !state.solved.includes(puzzle.id)) {
    return { title: puzzle.title, text: puzzle.hint, puzzleId: puzzle.id };
  }
  return { title: '这一章的证据已经齐了', text: state.chapter === lastChapter ? '准备好后，前往重逢，亲口说出你的选择。' : '打开推理页，继续下一章。' };
}

export function grantHint(state, requestId) {
  if (!validRequestId(requestId) || state.rewardIds.includes(requestId)
    || state.hintCredits >= Number.MAX_SAFE_INTEGER) return state;
  return touch(state, {
    hintCredits: state.hintCredits + 1,
    rewardIds: [...state.rewardIds, requestId].slice(-30),
  });
}

export function consumeHint(state) {
  if (state.hintCredits <= 0 || getEnding(state)) return { state, hint: null };
  return { state: touch(state, { hintCredits: state.hintCredits - 1 }), hint: nextHint(state) };
}

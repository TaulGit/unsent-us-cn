import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTERS, CLUES, FINALE, PUZZLES } from '../src/story.js';
import {
  advanceChapter, chapterReady, checkAnswer, chooseDialogue, collectClue, consumeHint,
  createState, getEnding, getProgress, grantHint, nextHint, restoreState, solvePuzzle,
} from '../src/engine.js';

const copy = (value) => JSON.parse(JSON.stringify(value));
const puzzleFor = (chapter) => PUZZLES.find((puzzle) => puzzle.id === chapter.puzzleId);

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
}

function findChapterEvidence(state) {
  return CHAPTERS[state.chapter].requiredClues.reduce((current, id) => collectClue(current, id), state);
}

function finishChapter(state) {
  let current = findChapterEvidence(state);
  const puzzle = puzzleFor(CHAPTERS[current.chapter]);
  if (puzzle) {
    const result = solvePuzzle(current, puzzle.id, puzzle.solution);
    assert.equal(result.ok, true, `Chapter ${current.chapter}: evidence should support its answer`);
    current = result.state;
  }
  assert.equal(chapterReady(current), true);
  return advanceChapter(current);
}

function reachFinale() {
  let state = createState(1000);
  for (let index = 0; index < CHAPTERS.length; index += 1) state = finishChapter(state);
  assert.equal(state.finale, true);
  return state;
}

test('完整调查必须经历五章，全部证据与四次推理才能进入六轮重逢', () => {
  let state = freeze(createState(1000));
  const original = copy(state);
  assert.equal(state.hintCredits, 2);
  assert.equal(getEnding(state), null);
  for (let chapter = 0; chapter < CHAPTERS.length; chapter += 1) {
    assert.equal(state.chapter, chapter);
    assert.equal(state.finale, false);
    assert.strictEqual(advanceChapter(state), state, 'unread evidence must block advancement');
    state = finishChapter(state);
  }
  assert.deepEqual(original, createState(1000), 'the original state must not be mutated');
  assert.equal(state.chapter, CHAPTERS.length - 1);
  assert.equal(state.clues.length, CLUES.length);
  assert.equal(state.solved.length, PUZZLES.length);
  assert.equal(state.dialogueIndex, 0);
  assert.deepEqual(getProgress(state), {
    found: CLUES.length, total: CLUES.length, percent: 100,
    chapter: CHAPTERS.length - 1, chapters: CHAPTERS.length,
  });
  assert.strictEqual(advanceChapter(state), state);
});

test('已知答案不能代替查证，也不能提前收集未来证据或解后章谜题', () => {
  const state = freeze(createState(1000));
  const first = PUZZLES.find((puzzle) => puzzle.chapter === 0);
  const future = PUZZLES.find((puzzle) => puzzle.chapter > 0);
  const futureClue = CLUES.find((clue) => clue.chapter > 0);
  assert.strictEqual(collectClue(state, futureClue.id), state);
  assert.strictEqual(collectClue(state, 'unknown-clue'), state);
  assert.deepEqual(solvePuzzle(state, first.id, first.solution).state, state);
  assert.equal(solvePuzzle(state, first.id, first.solution).ok, false);
  assert.equal(solvePuzzle(state, future.id, future.solution).ok, false);
  assert.strictEqual(solvePuzzle(state, 'unknown-puzzle', 'anything').state, state);
  const onlyPuzzleEvidence = first.requiredClues.reduce((current, id) => collectClue(current, id), state);
  const solved = solvePuzzle(onlyPuzzleEvidence, first.id, first.solution).state;
  const stillMissingEvidence = CHAPTERS[0].requiredClues.some((id) => !solved.clues.includes(id));
  if (stillMissingEvidence) assert.strictEqual(advanceChapter(solved), solved);
});

test('错误答案可重试，不丢证据、不解锁剧情；重复查阅和解题不会重复记账', () => {
  const state = freeze(findChapterEvidence(createState(1000)));
  const first = puzzleFor(CHAPTERS[0]);
  const wrong = solvePuzzle(state, first.id, 'this-is-not-an-answer');
  assert.equal(wrong.ok, false);
  assert.deepEqual(wrong.state.clues, state.clues);
  assert.deepEqual(wrong.state.solved, []);
  assert.equal(wrong.state.attempts[first.id], 1);
  assert.strictEqual(advanceChapter(wrong.state), wrong.state);
  const correct = solvePuzzle(freeze(wrong.state), first.id, first.solution);
  assert.equal(correct.ok, true);
  assert.equal(correct.state.attempts[first.id], 2);
  assert.strictEqual(solvePuzzle(correct.state, first.id, first.solution).state, correct.state);
  assert.strictEqual(collectClue(correct.state, state.clues[0]), correct.state);
});

test('日期代码容忍全角和空格，顺序题拒绝重复、缺项、乱序，选择题不接受显示文本', () => {
  const code = PUZZLES.find((puzzle) => puzzle.kind === 'code');
  assert.ok(code, 'the story needs its date puzzle');
  const wide = String(code.solution).split('').map((char) => /[0-9]/.test(char)
    ? String.fromCharCode(char.charCodeAt(0) + 0xfee0) : char).join(' ');
  assert.equal(checkAnswer(code.id, `  ${wide}  `), true);
  assert.equal(checkAnswer(code.id, {}), false);
  const order = PUZZLES.find((puzzle) => puzzle.kind === 'order');
  assert.equal(checkAnswer(order.id, [...order.solution].reverse()), false);
  assert.equal(checkAnswer(order.id, order.solution.slice(1)), false);
  assert.equal(checkAnswer(order.id, order.solution.map(() => order.solution[0])), false);
  assert.equal(checkAnswer(order.id, order.solution.join(',')), false);
  const choice = PUZZLES.find((puzzle) => puzzle.kind === 'choice');
  assert.equal(checkAnswer(choice.id, choice.solution), true);
  assert.equal(checkAnswer(choice.id, choice.options.find((option) => option.id === choice.solution).text), false);
  assert.equal(checkAnswer('unknown', 'anything'), false);
});

test('每章进行中的存档均能无损恢复，重逢中的选择通过重放保留', () => {
  let state = createState(1000);
  for (let chapter = 0; chapter < CHAPTERS.length; chapter += 1) {
    state = collectClue(state, CHAPTERS[chapter].requiredClues[0]);
    assert.deepEqual(restoreState(freeze(copy(state))), state);
    state = finishChapter(state);
  }
  for (const round of FINALE.rounds.slice(0, 3)) {
    const chosen = chooseDialogue(state, round.id, round.choices[0].id);
    assert.equal(chosen.ok, true);
    state = chosen.state;
  }
  const restored = restoreState(freeze(copy(state)));
  assert.deepEqual(restored, state);
  assert.equal(restored.dialogueIndex, 3);
  assert.equal(getEnding(restored), null);
});

test('损坏存档不应开启未来章节，也不信任伪造的分数、结局和对话进度', () => {
  for (const input of [null, [], 'broken', { version: 999 }]) {
    const state = restoreState(input);
    assert.equal(state.chapter, 0);
    assert.equal(state.clues.length, 0);
    assert.equal(state.hintCredits, 2);
  }
  const corrupt = {
    ...createState(1000), chapter: 4,
    clues: [CHAPTERS[0].requiredClues[0], CLUES.find((clue) => clue.chapter === 4).id, 'unknown'],
    solved: PUZZLES.map((puzzle) => puzzle.id).concat('unknown'),
    attempts: { [PUZZLES[0].id]: -1, unknown: 999 },
    finale: true, dialogueIndex: 6, scores: { empathy: 99, honesty: 99, boundary: 99 },
    ending: 'reconnect', choices: [{ roundId: FINALE.rounds[5].id, choiceId: FINALE.rounds[5].choices[0].id }],
    hintCredits: Infinity, rewardIds: ['', 'reward-one', 'reward-one', null], updatedAt: -1,
  };
  const restored = restoreState(freeze(corrupt));
  assert.equal(restored.chapter, 0);
  assert.deepEqual(restored.clues, [CHAPTERS[0].requiredClues[0]]);
  assert.deepEqual(restored.solved, []);
  assert.deepEqual(restored.attempts, {});
  assert.equal(restored.finale, false);
  assert.equal(restored.dialogueIndex, 0);
  assert.deepEqual(restored.scores, { empathy: 0, boundary: 0, honesty: 0 });
  assert.equal(restored.ending, null);
  assert.equal(restored.hintCredits, 2);
  assert.deepEqual(restored.rewardIds, ['reward-one']);
  assert.ok(restored.updatedAt >= restored.createdAt);
});

test('不能跳过或重答重逢轮次，恢复时无效选择后的内容被舍弃', () => {
  const beforeFinale = createState(1000);
  const [first, second] = FINALE.rounds;
  assert.strictEqual(chooseDialogue(beforeFinale, first.id, first.choices[0].id).state, beforeFinale);
  let state = freeze(reachFinale());
  assert.equal(chooseDialogue(state, second.id, second.choices[0].id).ok, false);
  assert.equal(chooseDialogue(state, first.id, 'unknown-choice').ok, false);
  state = chooseDialogue(state, first.id, first.choices[0].id).state;
  assert.equal(chooseDialogue(state, first.id, first.choices[1].id).ok, false);
  const claimed = {
    ...state,
    choices: [...state.choices, { roundId: FINALE.rounds[3].id, choiceId: FINALE.rounds[3].choices[0].id }],
    dialogueIndex: 6, scores: { empathy: 999, boundary: 999, honesty: 999 }, ending: 'reconnect',
  };
  const restored = restoreState(claimed);
  assert.equal(restored.dialogueIndex, 1);
  assert.deepEqual(restored.scores, state.scores);
  assert.equal(restored.ending, null);
});

test('同一份完整证据可以走向重新联系、保持距离或正式告别三个结局', () => {
  const selectors = {
    reconnect: (round) => round.choices.reduce((best, choice) => (
      choice.effects.empathy * 10 + choice.effects.honesty > best.effects.empathy * 10 + best.effects.honesty
        ? choice : best)),
    farewell: (round) => round.choices.reduce((best, choice) => choice.effects.empathy < best.effects.empathy ? choice : best),
    distance: (round) => [...round.choices].sort((a, b) => a.effects.empathy - b.effects.empathy)[1],
  };
  for (const [expected, select] of Object.entries(selectors)) {
    let state = reachFinale();
    for (const [index, round] of FINALE.rounds.entries()) {
      const result = chooseDialogue(freeze(state), round.id, select(round).id);
      assert.equal(result.ok, true);
      state = result.state;
      if (index < FINALE.rounds.length - 1) assert.equal(getEnding(state), null);
    }
    assert.equal(getEnding(state), expected);
    assert.equal(state.ending, expected);
    assert.equal(state.choices.length, 6);
    assert.deepEqual(restoreState(copy(state)), state);
    assert.strictEqual(chooseDialogue(state, FINALE.rounds[0].id, FINALE.rounds[0].choices[0].id).state, state);
  }
});

test('充分理解对方之后仍可明确告别或保持距离，读档也必须尊重最后的意愿', () => {
  for (const [choiceId, expected] of [['r6-goodbye', 'farewell'], ['r6-distance', 'distance']]) {
    let state = reachFinale();
    for (const round of FINALE.rounds.slice(0, -1)) {
      const warm = round.choices.reduce((best, choice) => choice.effects.empathy > best.effects.empathy ? choice : best);
      state = chooseDialogue(state, round.id, warm.id).state;
    }
    assert.ok(state.scores.empathy >= 6, 'earlier warmth should not override the final boundary');
    const last = FINALE.rounds.at(-1);
    const result = chooseDialogue(freeze(state), last.id, choiceId);
    assert.equal(result.ok, true);
    assert.ok(result.state.scores.honesty >= 5);
    assert.equal(result.state.ending, expected);
    assert.equal(getEnding(result.state), expected);
    const claimedReconnection = { ...copy(result.state), ending: 'reconnect' };
    const restored = restoreState(claimedReconnection);
    assert.equal(restored.ending, expected);
    assert.equal(getEnding(restored), expected);
  }
});

test('两次免费提示用完后需新增奖励；重复广告回调只加一次且不影响剧情', () => {
  let state = freeze(createState(1000));
  const hint = nextHint(state);
  assert.ok(hint.clueId);
  assert.ok(hint.text.includes(CLUES.find((clue) => clue.id === hint.clueId).source));
  state = consumeHint(state).state;
  state = consumeHint(state).state;
  assert.equal(state.hintCredits, 0);
  assert.deepEqual(consumeHint(state), { state, hint: null });
  assert.strictEqual(grantHint(state, ''), state);
  assert.strictEqual(grantHint(state, '  '), state);
  const rewarded = grantHint(freeze(state), 'ad-request-one');
  assert.equal(rewarded.hintCredits, 1);
  assert.strictEqual(grantHint(rewarded, 'ad-request-one'), rewarded);
  assert.deepEqual(rewarded.clues, state.clues);
  assert.deepEqual(rewarded.solved, state.solved);
  assert.deepEqual(rewarded.scores, state.scores);
  assert.equal(rewarded.chapter, state.chapter);
  assert.equal(restoreState(copy(rewarded)).hintCredits, 1);
  assert.strictEqual(grantHint(restoreState(copy(rewarded)), 'ad-request-one').hintCredits, 1);
  let recent = rewarded;
  for (let index = 0; index < 40; index += 1) recent = grantHint(recent, `ad-request-${index}`);
  assert.equal(recent.rewardIds.length, 30);
  assert.equal(recent.rewardIds[0], 'ad-request-10');
  assert.equal(recent.rewardIds.at(-1), 'ad-request-39');
});

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  CHAPTERS,
  CLUES,
  PUZZLES,
  THREADS,
  NOTES,
  PHOTOS,
  TRANSACTIONS,
  FINALE,
  ENDINGS,
} from "../src/story.js";
const base = fileURLToPath(new URL("..", import.meta.url));
const exists = async (p) => {
  try {
    return (await stat(path.join(base, p))).isFile();
  } catch {
    return false;
  }
};
const ids = CLUES.map((c) => c.id);
assert.equal(new Set(ids).size, CLUES.length, "duplicate clue ids");
const occurrences = new Map(ids.map((id) => [id, []]));
for (const t of THREADS)
  for (const m of t.messages)
    if (m.clueId) occurrences.get(m.clueId)?.push(t.chapter);
for (const item of [...PHOTOS, ...NOTES, ...TRANSACTIONS])
  if (item.clueId) occurrences.get(item.clueId)?.push(item.chapter);
for (const clue of CLUES)
  assert(
    occurrences.get(clue.id).some((ch) => ch <= clue.chapter),
    `unreachable clue ${clue.id}`,
  );
for (const chapter of CHAPTERS) {
  for (const id of chapter.requiredClues)
    assert(
      CLUES.some((c) => c.id === id && c.chapter <= chapter.id),
      `future clue ${id}`,
    );
  const p = PUZZLES.find((p) => p.id === chapter.puzzleId);
  if (p)
    for (const id of p.requiredClues)
      assert(
        CLUES.some((c) => c.id === id && c.chapter <= chapter.id),
        `future puzzle clue ${id}`,
      );
}
assert.equal(FINALE.rounds.length, 6);
for (const r of FINALE.rounds) assert.equal(r.choices.length, 3);
const assets = await readdir(path.join(base, "assets"));
assert.equal(assets.length, 13, "expected 13 finished raster assets");
let total = 0;
for (const file of assets) {
  assert(file.endsWith(".webp"), "raster asset format");
  const p = path.join(base, "assets", file),
    m = await sharp(p).metadata();
  assert.equal(m.format, "webp");
  assert(m.width >= 600 && m.height >= 600);
  total += (await stat(p)).size;
}
for (const item of [...PHOTOS, ...Object.values(ENDINGS)])
  assert(await exists(item.asset), `missing art ${item.asset}`);
for (const file of [
  "index.html",
  "styles.css",
  "src/app.js",
  "src/audio.js",
  "src/platform.js",
  "src/engine.js",
  "src/story.js",
]) {
  const content = await readFile(path.join(base, file), "utf8");
  assert(
    !/<svg\b|data:image\/svg|[\u{1F300}-\u{1FAFF}]/u.test(content),
    `svg or emoji in ${file}`,
  );
  for (const match of content.matchAll(
    /(?:\.\/)?assets\/[\w.-]+\.(?:webp|png|jpe?g)/g,
  ))
    assert(
      await exists(match[0].replace(/^\.\//, "")),
      `missing referenced ${match[0]}`,
    );
}
console.log(
  `Verified ${CHAPTERS.length} chapters, ${CLUES.length} reachable clues, ${PUZZLES.length} puzzles, ${THREADS.reduce((n, t) => n + t.messages.length, 0)} messages, 3 endings; 13 WebP assets (${(total / 1024 / 1024).toFixed(2)} MiB).`,
);

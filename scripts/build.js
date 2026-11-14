import { cp, mkdir, rm } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const out = new URL("../dist/", import.meta.url);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const file of ["index.html", "styles.css", "src", "assets"])
  await cp(new URL(file, root), new URL(file, out), { recursive: true });
console.log("Built dist/: static game, all relative assets included.");

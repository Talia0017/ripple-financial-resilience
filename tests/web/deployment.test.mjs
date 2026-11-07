import {test} from "node:test";
import assert from "node:assert/strict";
import {access, cp, mkdir, mkdtemp, readFile, rm} from "node:fs/promises";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {decodeProfiles} from "../../public/engine.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = promisify(execFile);

test("configured deployment directory contains the entrypoint and its linked assets", async () => {
  const config = JSON.parse(await readFile(path.join(root, "vercel.json"), "utf8"));
  assert.equal(config.framework, null);
  assert.equal(config.buildCommand, "");
  const directory = path.resolve(root, config.outputDirectory);
  const html = await readFile(path.join(directory, "index.html"), "utf8");
  for (const [, reference] of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)) {
    await access(path.resolve(directory, reference));
  }
  const profiles = decodeProfiles(JSON.parse(await readFile(path.join(directory, "data/profiles.json"), "utf8")));
  assert.equal(profiles.size, 4500);
});

test("static validation succeeds in a clean source copy without generating dist", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ripple-static-deployment-"));
  try {
    await cp(path.join(root, "public"), path.join(directory, "public"), {recursive: true});
    await mkdir(path.join(directory, "scripts"));
    await cp(path.join(root, "scripts/build.mjs"), path.join(directory, "scripts/build.mjs"));
    const result = await run(process.execPath, ["scripts/build.mjs"], {cwd: directory});
    assert.match(result.stdout, /4,500/);
    await assert.rejects(access(path.join(directory, "dist")), {code: "ENOENT"});
    await access(path.join(directory, "public/index.html"));
    await access(path.join(directory, "public/data/profiles.json"));
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

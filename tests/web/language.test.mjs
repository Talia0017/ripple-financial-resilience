import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile, readdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

// Use Script rather than Script_Extensions to allow shared English punctuation.
const ideographs = /\p{Script=Han}/u;
const root = fileURLToPath(new URL("../../", import.meta.url));
const skipped = new Set([".venv", "venv", "__pycache__", "node_modules", ".pytest_cache", ".cache"]);
const textExtensions = new Set([".md", ".py", ".mjs", ".js", ".json", ".html", ".css", ".command", ".txt"]);

async function collect(directory) {
  const files = [];
  for (const entry of await readdir(path.join(root, directory), {withFileTypes: true})) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory() && !skipped.has(entry.name)) files.push(...await collect(relative));
    else if (entry.isFile() && (textExtensions.has(path.extname(entry.name)) || entry.name === ".gitignore")) files.push(relative);
  }
  return files;
}

test("project-owned content and public account data use English only", async () => {
  const files = ["README.md", "VERCEL_DEPLOYMENT.md", "AGENTS.md", "data/README.md", "Dockerfile", ".gitignore", ".dockerignore", ".vercelignore", "vercel.json", "package.json", "package-lock.json"];
  for (const directory of ["financial_resilience", "public", "scripts", "tests"]) files.push(...await collect(directory));
  const violations = [];
  for (const file of files) {
    if (ideographs.test(file) || ideographs.test(await readFile(path.join(root, file), "utf8"))) violations.push(file);
  }
  assert.deepEqual(violations, [], `English-only policy violations: ${violations.join(", ")}`);
  assert.match(await readFile(path.join(root, "public/index.html"), "utf8"), /<html lang="en">/);
});

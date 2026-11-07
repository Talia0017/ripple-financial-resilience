// No Python, CSVs, npm dependencies, or network are required at deployment time.
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {decodeProfiles} from "../public/engine.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = ["index.html", "styles.css", "app.mjs", "engine.mjs", "data/profiles.json"];
const payload = JSON.parse(await readFile(path.join(root, "public/data/profiles.json"), "utf8"));
const profiles = decodeProfiles(payload);
if (profiles.size !== 4500) throw new Error(`Expected all 4,500 official accounts; got ${profiles.size}.`);
for (const file of files) await readFile(path.join(root, "public", file));
console.log(`Validated the static site in public/ with all ${profiles.size.toLocaleString("en-CA")} official profiles. No compilation or generated output directory is required.`);

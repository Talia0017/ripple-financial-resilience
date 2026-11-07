// No Python, CSVs, npm dependencies, or network are required at deployment time.
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {decodeProfiles} from "../public/engine.mjs";
import {decodeHistory, datasetStory} from "../public/dashboard.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = ["index.html", "styles.css", "app.mjs", "engine.mjs", "dashboard.mjs", "charts.mjs", "data/profiles.json", "data/history.json"];
const payload = JSON.parse(await readFile(path.join(root, "public/data/profiles.json"), "utf8"));
const profiles = decodeProfiles(payload);
if (profiles.size !== 4500) throw new Error(`Expected all 4,500 official accounts; got ${profiles.size}.`);
const history = JSON.parse(await readFile(path.join(root, "public/data/history.json"), "utf8"));
decodeHistory(history, profiles, payload.dataset.source_sha256);
if (!datasetStory(profiles)) throw new Error("Dataset storytelling analysis is unavailable.");
for (const file of files) await readFile(path.join(root, "public", file));
console.log(`Validated all ${files.length} static assets, ${profiles.size.toLocaleString("en-CA")} official profiles and ${history.dataset.exported_rows.toLocaleString("en-CA")} recorded cash flows. No compilation or generated output directory is required.`);

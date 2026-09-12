// Bouwt world/data/repos.json uit de GitHub API (publieke repos van de owner).
// Draait in de Pages-workflow; lokaal: GITHUB_TOKEN=... node scripts/build-snapshot.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const registry = JSON.parse(readFileSync(join(root, "registry.json"), "utf8"));
const owner = registry.owner;
const headers = { "User-Agent": "bold700-hq", Accept: "application/vnd.github+json" };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

const repos = [];
for (let page = 1; page <= 5; page++) {
  const res = await fetch(`https://api.github.com/users/${owner}/repos?per_page=100&sort=pushed&page=${page}`, { headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  const batch = await res.json();
  repos.push(...batch);
  if (batch.length < 100) break;
}

const out = {
  generated_at: new Date().toISOString(),
  source: "GitHub API via scripts/build-snapshot.mjs",
  repos: repos.map((r) => ({
    name: r.name,
    description: r.description || "",
    language: r.language || "",
    homepage: r.homepage || "",
    pushed_at: r.pushed_at,
    private: r.private,
    archived: r.archived,
    open_issues: r.open_issues_count,
    stars: r.stargazers_count,
  })),
};

// Private repos komen niet uit de publieke API; neem ze mee uit de vorige snapshot zodat ze zichtbaar blijven.
try {
  const prev = JSON.parse(readFileSync(join(root, "world/data/repos.json"), "utf8"));
  const seen = new Set(out.repos.map((r) => r.name));
  for (const r of prev.repos) if (!seen.has(r.name)) out.repos.push({ ...r, stale: true });
} catch {}

writeFileSync(join(root, "world/data/repos.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`snapshot: ${out.repos.length} repos`);

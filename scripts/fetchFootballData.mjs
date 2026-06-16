/**
 * fetchFootballData.mjs
 * --------------------------------------------------------------------------
 * Pulls 2026 Men's World Cup data from the football-data.org v4 API and writes
 * a single public JSON file the static site can read:
 *
 *     public/data/world-cup-live.json
 *
 * The API key is read from process.env.FOOTBALL_DATA_API_KEY and sent as the
 * X-Auth-Token header. The key is NEVER written into the output file or any
 * committed source — it only exists as a GitHub Actions secret.
 *
 * Usage (locally):
 *     FOOTBALL_DATA_API_KEY=xxxxx node scripts/fetchFootballData.mjs
 *
 * The script is intentionally resilient: if an endpoint is unavailable (e.g.
 * the free tier doesn't expose WC yet, or rate limits hit), it records the
 * error in the `errors` array and still writes a valid file so the site keeps
 * working.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "..", "public", "data", "world-cup-live.json");

const API_BASE = "https://api.football-data.org/v4";
const COMPETITION = "WC"; // FIFA World Cup
const SEASON = "2026";
const TOKEN = process.env.FOOTBALL_DATA_API_KEY;

/** Small helper to call the API with the auth header and basic error handling. */
async function apiGet(pathname, errors) {
  const url = `${API_BASE}${pathname}`;
  try {
    const res = await fetch(url, { headers: { "X-Auth-Token": TOKEN } });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      errors.push(`GET ${pathname} -> HTTP ${res.status} ${res.statusText} ${truncate(body)}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    errors.push(`GET ${pathname} -> ${err.message}`);
    return null;
  }
}

const truncate = (s) => (s && s.length > 200 ? s.slice(0, 200) + "…" : s || "");

/** Be polite to the free tier (10 req/min): small delay between calls. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const errors = [];

  if (!TOKEN) {
    errors.push("FOOTBALL_DATA_API_KEY is not set; wrote an empty live-data file.");
    await write({ competition: null, teams: [], matches: [], standings: [], errors });
    console.warn("⚠ No FOOTBALL_DATA_API_KEY found — wrote placeholder live data.");
    return; // don't exit non-zero; the workflow should still succeed
  }

  // 1) Competition info
  const competition = await apiGet(`/competitions/${COMPETITION}`, errors);
  await sleep(7000);

  // 2) Teams
  const teamsRes = await apiGet(`/competitions/${COMPETITION}/teams?season=${SEASON}`, errors);
  const teams = (teamsRes && teamsRes.teams) || [];
  await sleep(7000);

  // 3) Matches
  const matchesRes = await apiGet(`/competitions/${COMPETITION}/matches?season=${SEASON}`, errors);
  const matches = (matchesRes && matchesRes.matches) || [];
  await sleep(7000);

  // 4) Standings (group tables)
  const standingsRes = await apiGet(`/competitions/${COMPETITION}/standings?season=${SEASON}`, errors);
  const standings = (standingsRes && standingsRes.standings) || [];

  await write({ competition, teams, matches, standings, errors });

  console.log(
    `✓ Wrote ${OUT_PATH} — ${teams.length} teams, ${matches.length} matches, ${standings.length} standings groups, ${errors.length} errors.`
  );
}

async function write({ competition, teams, matches, standings, errors }) {
  const payload = {
    source: "football-data.org",
    competitionCode: COMPETITION,
    season: SEASON,
    generatedAt: new Date().toISOString(),
    competition,
    teams,
    matches,
    standings,
    errors
  };
  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

main().catch(async (err) => {
  // Last-resort guard: still write a valid file so the site never 404s.
  console.error("Fatal error:", err);
  try {
    await write({ competition: null, teams: [], matches: [], standings: [], errors: [String(err)] });
  } catch (_) {}
  process.exit(0);
});

# ⚽ World Cup Super Fun Time

A polished, mobile-friendly, **static** web app for running a **2026 Men's World Cup snake draft** between three owners — then locking it and sharing a read-only board with friends.

> 3 owners · 12 teams each · 36 of 48 teams drafted · group-stage wins + knockout bonuses · live scoring from [football-data.org](https://www.football-data.org/).

**Live site:** https://chriscasensmith-source.github.io/World-Cup-Super-Fun-Time/

---

## What it is

- **Local snake draft** on one device. Pick by pick, the app enforces whose turn it is — you can't hand a team to the wrong owner.
- **Commissioner tools** before locking: undo a pick, move a drafted team to another owner, reorder the snake, or reset.
- **Auto-save** to `localStorage`, so refreshing never loses the draft.
- **Lock & publish**: export a `draft-lock.json`, commit it, and the live site becomes a frozen, read-only board everyone sees identically.
- **Live scoring**: a GitHub Action periodically pulls World Cup data and the board computes points, goals, standings, and knockout progress.

### Owners
1. **Fookin Wanka**
2. **Swiftie Vibes**
3. **American Man!**

### Scoring
| Result | Points |
| --- | --- |
| Group-stage win | 1 |
| Group draw / loss | 0 |
| Round of 32 win | 2 |
| Round of 16 win | 3 |
| Quarterfinal win | 4 |
| Semifinal win | 5 |
| Third-place win | 4 |
| Final win | 6 |

Goals scored are a **tiebreaker only** — they never add points. Standings sort by **total points**, then **total goals** scored by all of an owner's teams.

---

## Project structure

```
.
├── index.html                     # the whole app (no build step)
├── assets/
│   ├── css/styles.css
│   └── js/
│       ├── teams.js               # seeded 48-team list + owners + scoring config
│       └── app.js                 # draft logic, persistence, scoring, UI
├── public/data/
│   ├── draft-lock.json            # publish target: { "locked": false } until you lock
│   └── world-cup-live.json        # written by the GitHub Action (live data)
├── scripts/fetchFootballData.mjs  # pulls football-data.org v4 → world-cup-live.json
├── .github/workflows/
│   ├── update-football-data.yml   # scheduled + manual data refresh
│   └── deploy-pages.yml           # deploy to GitHub Pages on push to main
└── package.json                   # optional; no dependencies
```

---

## Run it locally

It's a no-build static site. Two options:

**Just open it** — double-click `index.html`. The app falls back to local draft mode automatically when it can't fetch the JSON files over `file://`. Team data is bundled, so the full draft works offline.

**Serve it (recommended)** — so the JSON files load and you can preview locked mode:

```bash
# any static server works; pick one
python3 -m http.server 8080        # then open http://localhost:8080
# or
npx serve .
```

---

## Draft, lock, and publish

1. Open the site (locally or on Pages) — it starts in **Local Draft Mode**.
2. (Optional) Reorder the **Snake Order** before/while drafting.
3. Click a team in **Available Teams**, then **Draft to <owner>**. The app only lets the owner on the clock draft.
4. Use **Undo**, **Move team to…**, or **Reset** as needed. Picks auto-save to your browser.
5. When all 36 picks are in, click **⬇ Export Lock JSON**.
6. **Download** (or copy) the JSON and use it to replace **`public/data/draft-lock.json`**.
7. Commit & push:
   ```bash
   git add public/data/draft-lock.json
   git commit -m "Lock the 2026 World Cup draft"
   git push
   ```
8. Once `draft-lock.json` has `"locked": true`, every visitor sees the same locked board with a **Draft Locked** badge and all editing disabled. Share the Pages URL with friends. 🎉

### Resume a draft on another device

In-progress picks are saved only in **your** browser (`localStorage`), so they aren't shared until you lock. To move an unfinished draft between devices:

1. On the first device, click **💾 Save Draft (JSON)** to download `draft-progress.json`.
2. On the other device, open the site and click **⬆ Import Draft JSON**, then paste the JSON or choose the file and hit **Load Draft**.

Import accepts both a saved `draft-progress.json` and an exported `draft-lock.json` (a locked file loads back as an editable draft). It validates picks, drops unknown/duplicate teams, enforces the 12-per-owner cap, and re-sequences pick numbers. Import is disabled when the published site is locked.

The locked file looks like:

```json
{
  "locked": true,
  "lockedAt": "2026-06-16T18:00:00.000Z",
  "draftOrder": ["fookin-wanka", "swiftie-vibes", "american-man"],
  "picks": [
    { "teamId": "argentina", "ownerId": "fookin-wanka", "pickNumber": 1 }
  ]
}
```

To re-open drafting, set `"locked": false` (or restore the default file) and push.

---

## Enable GitHub Pages

1. Repo **Settings → Pages**.
2. **Source: GitHub Actions**.
3. Push to `main` — the `Deploy to GitHub Pages` workflow publishes the site to
   `https://chriscasensmith-source.github.io/World-Cup-Super-Fun-Time/`.

> The app uses **relative** fetch paths (`public/data/…`), so it works correctly under the `/World-Cup-Super-Fun-Time/` base path with no extra config.

---

## Live data: football-data.org

### 1. Add the API key as a repository secret
**Never commit the key.** Store it only as a secret:

1. Get a free token at https://www.football-data.org/client/register.
2. Repo **Settings → Secrets and variables → Actions → New repository secret**.
3. Name it **`FOOTBALL_DATA_API_KEY`**, paste the token, save.

### 2. Run / schedule the data workflow
- The **Update Football Data** workflow runs automatically every 6 hours and can be run manually from the **Actions** tab (**Run workflow**).
- It runs `scripts/fetchFootballData.mjs` with the secret as the `X-Auth-Token` header, fetches competition / teams / matches / standings for competition `WC` season `2026`, and commits the result to `public/data/world-cup-live.json`.
- The script is resilient: if an endpoint is unavailable or rate-limited, it records the issue in the file's `errors` array and still writes a valid file, so the site never breaks.

Run it locally too:

```bash
FOOTBALL_DATA_API_KEY=your_token_here node scripts/fetchFootballData.mjs
# or: npm run fetch-data   (with the env var set)
```

> Note: football-data.org's free tier may not expose full 2026 World Cup match data. The team list is seeded manually so the draft works regardless, and the scoring engine automatically lights up once real match results land in `world-cup-live.json`.

---

## Security

- The football-data.org API key lives **only** as the `FOOTBALL_DATA_API_KEY` GitHub Actions secret.
- It is **never** in browser code, never written to `world-cup-live.json`, and `.env*` is git-ignored.
- The browser only ever reads pre-generated public JSON — it never calls the API directly.

---

## License

MIT

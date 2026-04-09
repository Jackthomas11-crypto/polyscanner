/**
 * PolyScanner Proxy — deploy this FREE on Render.com
 * Works on any device including your phone.
 *
 * Deploy steps (3 min):
 * 1. Push this folder to a GitHub repo
 * 2. Go to render.com → New → Web Service → connect repo
 * 3. Build command: npm install
 *    Start command: node server.js
 * 4. Add env var: ODDS_API_KEY = your key from the-odds-api.com
 * 5. Deploy — copy your .onrender.com URL into the scanner
 */

const express = require("express");
const cors    = require("cors");
const axios   = require("axios");

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors()); // allow all origins — scanner needs this
app.use(express.json());

const BOOKMAKERS = "pinnacle,draftkings,fanduel,betmgm,williamhill_us";
const SPORTS = [
  "basketball_nba",
  "americanfootball_nfl",
  "baseball_mlb",
  "icehockey_nhl",
  "soccer_epl",
  "soccer_uefa_champs_league",
];

// ── Health ──────────────────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok", ts: Date.now() }));

// ── Polymarket ──────────────────────────────────────────────────────────────
app.get("/polymarket", async (req, res) => {
  try {
    const r = await axios.get("https://clob.polymarket.com/markets", {
      params: { active: true, closed: false, limit: 100, tag_slug: "sports" },
      timeout: 10000,
    });
    res.json(r.data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Odds API ────────────────────────────────────────────────────────────────
app.get("/odds/:sport", async (req, res) => {
  const { sport } = req.params;

  if (!SPORTS.includes(sport)) {
    return res.status(400).json({ error: "Unknown sport key" });
  }

  // Key can come from env (server-side) OR query param (client passes it)
  const apiKey = process.env.ODDS_API_KEY || req.query.apiKey;
  if (!apiKey) {
    return res.status(400).json({ error: "No ODDS_API_KEY set — add it as an env var on Render" });
  }

  try {
    const r = await axios.get(
      `https://api.the-odds-api.com/v4/sports/${sport}/odds/`,
      {
        params: {
          apiKey,
          regions:    "us",
          markets:    "h2h",
          oddsFormat: "american",
          bookmakers: BOOKMAKERS,
        },
        timeout: 10000,
      }
    );
    // Forward quota headers so the UI can display them
    res.set("x-requests-remaining", r.headers["x-requests-remaining"] || "");
    res.set("x-requests-used",      r.headers["x-requests-used"]      || "");
    res.json(r.data);
  } catch (e) {
    const status = e.response?.status || 500;
    res.status(status).json({ error: e.response?.data || e.message });
  }
});

// ── All sports in one call (saves quota hits) ───────────────────────────────
app.get("/odds-all", async (req, res) => {
  const apiKey = process.env.ODDS_API_KEY || req.query.apiKey;
  if (!apiKey) return res.status(400).json({ error: "Missing API key" });

  const results = [];
  let lastRemaining = "", lastUsed = "";

  for (const sport of SPORTS) {
    try {
      const r = await axios.get(
        `https://api.the-odds-api.com/v4/sports/${sport}/odds/`,
        {
          params: { apiKey, regions: "us", markets: "h2h", oddsFormat: "american", bookmakers: BOOKMAKERS },
          timeout: 10000,
        }
      );
      lastRemaining = r.headers["x-requests-remaining"] || lastRemaining;
      lastUsed      = r.headers["x-requests-used"]      || lastUsed;
      if (Array.isArray(r.data)) {
        r.data.forEach(g => results.push({ ...g, _sport: sport }));
      }
    } catch (e) {
      if (e.response?.status === 401) {
        return res.status(401).json({ error: "Invalid Odds API key" });
      }
      // 422 = sport unavailable, skip silently
    }
  }

  res.set("x-requests-remaining", lastRemaining);
  res.set("x-requests-used",      lastUsed);
  res.json(results);
});

app.listen(PORT, () => console.log(`PolyScanner proxy running on port ${PORT}`));

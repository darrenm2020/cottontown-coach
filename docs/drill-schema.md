# Drill format

Each drill is one JSON object. The starter library lives in `public/data/drills.json` (an array).
Coaches' own drills use the same shape and are saved on the server.

```json
{
  "id": "pass-gates-01",
  "title": "Passing Gates",
  "topic": "passing",
  "ages": ["7v7", "9v9"],
  "players": "8-14",
  "minutes": 12,
  "intensity": "medium",
  "space": "30 x 25 yards",
  "equipment": ["1 ball per pair", "16 cones"],
  "summary": "Pairs pass through as many cone gates as they can in 60 seconds.",
  "setup": "Scatter 8 gates (2 cones, 2 yards apart) inside the grid. Players in pairs, one ball per pair.",
  "how": ["Step 1 ...", "Step 2 ..."],
  "coaching": ["Inside of the foot, ankle locked", "Pass into your partner's front foot"],
  "easier": "Bigger gates; partner can stop the ball before passing.",
  "harder": "Two-touch limit; a defender guards two gates.",
  "video": "",
  "diagram": {
    "w": 30, "h": 25,
    "items": [
      {"t": "cone", "x": 5, "y": 5},
      {"t": "player", "team": "a", "x": 8, "y": 10, "label": "1"},
      {"t": "player", "team": "b", "x": 15, "y": 12},
      {"t": "gk", "x": 15, "y": 2},
      {"t": "ball", "x": 9, "y": 10},
      {"t": "goal", "x": 15, "y": 0, "w": 6},
      {"t": "minigoal", "x": 2, "y": 12, "w": 2, "side": "left"},
      {"t": "zone", "x": 0, "y": 0, "w": 10, "h": 25, "label": "Zone 1"},
      {"t": "pass", "from": [8, 10], "to": [15, 12]},
      {"t": "run", "from": [8, 10], "to": [12, 6]},
      {"t": "dribble", "from": [15, 12], "to": [20, 15]},
      {"t": "shot", "from": [15, 8], "to": [15, 1]}
    ]
  }
}
```

## Fields

| Field | Values |
|---|---|
| `id` | lowercase, unique, `topic-word-NN` |
| `topic` | `warmup`, `passing`, `first-touch`, `dribbling`, `1v1-attack`, `1v1-defend`, `possession`, `build-out`, `finishing`, `transition`, `defending-team`, `goalkeeping`, `small-sided`, `fun-games` |
| `ages` | any of `7v7`, `9v9`, `11v11` (who it suits) |
| `intensity` | `low`, `medium`, `high` |
| `minutes` | typical block length, 8 to 25 |
| `diagram` | coordinates in yards; origin top-left; `w`/`h` is the drawn area (match `space`). Team `a` = our attackers/possession team (crimson), `b` = defenders/opponents (blue), `gk` = keeper. `goal` sits on a top or bottom edge; `minigoal` has `side` left/right/top/bottom. |

Rules: original wording only (no copying from books, sites or apps); youth-appropriate (no slide tackles below 11v11; heading not taught below 11v11);
plain coaching language; 3-6 `how` steps; 2-5 `coaching` points.

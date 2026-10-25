<div align="center">

# 🎯 Habit Streak & Identity Tracker for Obsidian

**An identity-based habit tracker for Obsidian, inspired by _Atomic Habits_.**
Every habit you complete casts a vote for the person you want to become.

[![CI](https://github.com/EngOREOO/obsidian-identity-habit-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/EngOREOO/obsidian-identity-habit-tracker/actions/workflows/ci.yml)
[![GitHub release](https://img.shields.io/github/v/release/EngOREOO/obsidian-identity-habit-tracker?sort=semver)](https://github.com/EngOREOO/obsidian-identity-habit-tracker/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/EngOREOO/obsidian-identity-habit-tracker/total)](https://github.com/EngOREOO/obsidian-identity-habit-tracker/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Obsidian](https://img.shields.io/badge/Obsidian-%E2%89%A51.5.0-7C3AED?logo=obsidian&logoColor=white)](https://obsidian.md)
[![Stars](https://img.shields.io/github/stars/EngOREOO/obsidian-identity-habit-tracker?style=social)](https://github.com/EngOREOO/obsidian-identity-habit-tracker/stargazers)

[Features](#-features) · [Install](#-installation) · [Quick start](#-quick-start) · [Workflow integration](#-integrate-it-with-your-obsidian-workflow) · [Dataview recipes](#-dataview-recipes) · [FAQ](#-faq)

</div>

---

Most habit trackers are all-or-nothing: miss one day, the streak resets, motivation collapses.
**Habit Streak & Identity Tracker** gives you a **consistency engine** in its place. Habits feed *identities* such as
"Athlete", "Reader" or "Creator". Progress is measured with a forgiving **30-day consistency score**, and you get
tools that keep the chain going on bad days: micro-habits, freeze days and Never-Miss-Twice warnings.

Your data stays yours. Every check-in is mirrored as plain **YAML frontmatter in your daily notes**, so
Dataview, Bases, Templater and any other plugin can read it.

## ✨ Features

| | Feature | What it does |
|---|---|---|
| 🪪 | **Identity XP & badges** | Each habit has a weight. Completing it casts that many XP votes for its identity. Identities level up: 🥉 Novice (0–29) → 🥈 Consistent (30–99) → 🥇 Explorer (100–249) → 💎 Master (250+). |
| 📊 | **30-day consistency score** | The main metric is `hits / scheduled days` over a rolling 30-day window, per habit and overall. Streaks are still shown, as a secondary metric. |
| ⚠️ | **Never Miss Twice** | Missed it last time and haven't done it yet today? The card turns amber with a *Critical Day* badge. |
| ❄️ | **Freeze / rest days** | A monthly allowance (default 2). Rest days protect streaks and are excluded from the consistency denominator. Freeze one habit or the whole day. |
| 🎯 | **Daily Focus Identity** | Pick one identity for the day. Its habits earn **2× XP**. |
| ⚡ | **Micro-habits & adaptive difficulty** | Every habit has a 2-minute version worth 50% XP. After 3+ misses in a row, a one-click *Complete Micro-Version* banner appears. |
| 🛡️ | **Burnout Guard** | If you keep heavy habits (weight ≥ 3) above 90% for 6+ days in a row, it suggests a recovery day. A 7-day load chart is included. |
| 🧠 | **Smart insights** | Scans the last 60 days for weekday friction ("Reading drops 60% on Fridays"), habit correlations ("Workout +75% on days you hydrate"), neglected identities and your strongest weekday. |
| 🟩 | **Heatmap** | A GitHub-style XP heatmap for 90 or 365 days. Hover a day for details, click it to jump there. |
| 📝 | **Monthly report** | One click writes a Markdown report with consistency tables, identity levels, insights and achievements. |
| 🧩 | **Embeddable blocks** | An `identity-tracker` code block puts cards, the heatmap, today's habits or insights inside any note. |
| 🔁 | **Two-way YAML sync** | Check-ins are written to daily-note frontmatter. If you edit that YAML by hand, the change flows back into the tracker. |
| 🌍 | **English / Arabic** | An instant `EN | عربي` switch with a full right-to-left layout. |
| 📱 | **Desktop & mobile** | No external runtime dependencies. Uses Obsidian theme variables, so light and dark themes both work. |

## 📦 Installation

### Option A: BRAT (recommended until it's in the community store)
1. Install **[Obsidian42 - BRAT](https://github.com/TfTHacker/obsidian42-brat)** from *Settings → Community plugins*.
2. Run the command **BRAT: Add a beta plugin for testing**.
3. Paste `https://github.com/EngOREOO/obsidian-identity-habit-tracker` and confirm.
4. Enable **Habit Streak & Identity Tracker** in *Settings → Community plugins*.

BRAT keeps the plugin updated automatically.

### Option B: Manual
1. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/EngOREOO/obsidian-identity-habit-tracker/releases/latest).
2. Create the folder `<your vault>/.obsidian/plugins/habit-streak-identity-tracker/` and put the three files in it.
3. Reload Obsidian and enable the plugin in *Settings → Community plugins*.

## 🚀 Quick start

1. Click the **🎯 target icon** in the ribbon. The dashboard opens in the right sidebar.
2. On first run, three identities are created for you, with example habits:

   | Identity | Habits (weight · micro-version) |
   |---|---|
   | 🏋️ Athlete | Gym / Calisthenics (3 · 10 min stretching), Hydration (1 · one large glass) |
   | 📚 Reader & Researcher | Deep Reading (2 · read 2 pages), Language / Skill Practice (2 · 5 min) |
   | 🛠️ Creator & Builder | Deep Work / Coding (3 · 15 min focused session) |

3. Edit or replace them with **+ → Add identity / Add habit**, or in *Settings → Habit Streak & Identity Tracker*.
4. Each day, log every habit with one tap: **✅ full**, **⚡ micro** or **❄️ rest**.

## 🔗 Integrate it with your Obsidian workflow

### 1. Daily notes (core plugin or Periodic Notes)

The tracker writes into the same daily notes you already use. Folder and date format are detected automatically, and
you can override both in settings. When you log a habit, the plugin adds or updates the note's frontmatter:

```yaml
---
gym_workout: true        # ✅ done
hydration: micro         # ⚡ micro-version
reading: rest            # ❄️ freeze / rest day
deep_work: false         # not done (yet)
identity_xp: 9           # XP earned that day
identity_focus: Athlete  # today's focus identity
---
```

- The YAML key of every habit is configurable, so you can match a schema you already have.
- Accepted values when you edit by hand: `true / done / yes / ✅`, `micro / partial / ⚡`, `rest / freeze / skip / ❄️`, `false / no`.
- If today's note doesn't exist yet, it is created when you log a habit. You can turn this off.
- The plugin uses `processFrontMatter`, Obsidian's official API, so the rest of your note is never touched.

### 2. Put the dashboard in your daily-note template

Add a block to your daily-note template (core Templates or Templater), and every day starts with your identities in view:

````markdown
## 🎯 Identity check-in
```identity-tracker
summary today
```
````

Available views (combine as many as you like, separated by spaces):

| View | Renders |
|---|---|
| `summary` | XP today · 30-day consistency · freeze days left |
| `today` | Today's habit cards with ✅ ⚡ ❄️ buttons |
| `cards` | Identity level cards with progress to the next badge |
| `heatmap` | XP heatmap |
| `insights` | Smart pattern & friction insights |

### 3. A "Home" or MOC dashboard

````markdown
# 🏠 Home
```identity-tracker
cards heatmap insights
```
````

### 4. Weekly and monthly reviews

- Run **Export monthly report** (command palette, or the button in the *Analytics* tab). It creates
  `Reports/Identity Report YYYY-MM.md` with frontmatter (`type: identity-report`, `consistency`, `xp`), so your
  reviews can be queried too.
- Link the report from your monthly review note, or embed it with `![[Identity Report 2026-10]]`.

### 5. Hotkeys & command palette

Bind any of these in *Settings → Hotkeys*:

| Command | Suggested hotkey |
|---|---|
| Open dashboard | `Ctrl/Cmd + Shift + H` |
| Quick-log a habit | `Ctrl/Cmd + Shift + L` |
| Quick-log a micro-habit | |
| Set today's focus identity | |
| Toggle freeze day for today | |
| Export monthly report | |
| Write today's habits to the daily note | |
| Toggle language (EN / عربي) | |

The status bar always shows `🎯 Identity: 80% | ⚡ 12 XP`. Click it to open the dashboard.

### 6. Companion plugins (optional)

If the **Habit Journey** or **Reading Journey** plugin is installed in the same vault, the tracker detects it and
connects automatically. No configuration is needed.

- **Habit Journey:** its habits become the source list, including groups, weekday schedules, count targets and archive dates. Groups map to identities, and a full ✅ is written back to its log, so both dashboards stay in sync in both directions.
- **Reading Journey:** reading habits are completed automatically from logged reading hours (partial hours count as a micro-version). Its daily-notes folder is reused, and monthly reports include reading hours and finished books.

You can turn each integration off in settings. Without them, the tracker manages its own habits.

## 📈 Dataview recipes

Because everything is stored as frontmatter, [Dataview](https://github.com/blacksmithgu/obsidian-dataview) can query it directly.
Replace `"Daily Notes"` with your own daily-notes folder.

**Last 14 days at a glance**
````markdown
```dataview
TABLE WITHOUT ID file.link AS Day, identity_xp AS "XP", identity_focus AS Focus, gym_workout AS Gym, reading AS Reading
FROM "Daily Notes"
WHERE identity_xp != null
SORT file.name DESC
LIMIT 14
```
````

**Calendar of workout days**
````markdown
```dataview
CALENDAR file.day
FROM "Daily Notes"
WHERE gym_workout = true
```
````

**Total XP per month**
````markdown
```dataview
TABLE WITHOUT ID dateformat(file.day, "yyyy-MM") AS Month, sum(rows.identity_xp) AS "Total XP"
FROM "Daily Notes"
WHERE identity_xp
GROUP BY dateformat(file.day, "yyyy-MM")
SORT Month DESC
```
````

**Every monthly report**
````markdown
```dataview
TABLE consistency AS "Consistency %", xp AS XP
FROM "Reports"
WHERE type = "identity-report"
SORT month DESC
```
````

## 🧮 How the numbers work

| Metric | Rule |
|---|---|
| XP | `done = weight`, `micro = weight × 0.5`, ×2 if the habit's identity is today's focus |
| Consistency | `(done + micro) / (done + micro + missed)` over the last 30 days. Rest days, unscheduled days and today (until you log it) are excluded |
| Streak | Consecutive scheduled days with done or micro. Rest days and unscheduled days neither extend nor break it |
| Critical day | The previous scheduled occurrence was missed and today is still open |
| Adaptive banner | 3 or more consecutive missed occurrences |
| Burnout Guard | 6+ consecutive days where more than 90% of heavy habits (weight ≥ 3) were fully completed |

## ⚙️ Settings

| Setting | Default |
|---|---|
| Language | English (`EN | عربي`) |
| Sync habits to daily-note frontmatter | On |
| Daily notes folder | Auto-detect |
| Daily note date format | `YYYY-MM-DD` |
| Create today's daily note when logging | On |
| Freeze days per month | 2 |
| Reports folder | `Reports` |
| Heatmap range | 90 days |
| Status bar item | On |
| Habit Journey / Reading Journey integration | On (only active when installed) |

All identities and habits can be created, edited and deleted from the settings tab or from modals. You never need to edit JSON.

## 🗂️ Where your data lives

- `.obsidian/plugins/habit-streak-identity-tracker/data.json` holds settings, identities, habits, micro/rest/focus records and the log.
- Your daily notes hold a readable YAML mirror of every day.

Nothing leaves your vault. There is no network access and no telemetry.

## ❓ FAQ

<details>
<summary><b>I missed a day. Is my progress gone?</b></summary>
No. Consistency is a rolling 30-day percentage, so a single miss costs about 3%. Use ❄️ when you deliberately rest, or ⚡ to keep the chain going with a 2-minute version.
</details>

<details>
<summary><b>Does it work on mobile?</b></summary>
Yes. The plugin is not desktop-only, and the dashboard is built for narrow sidebars and phone screens.
</details>

<details>
<summary><b>Can I use my existing frontmatter keys?</b></summary>
Yes. Set each habit's <i>YAML key</i> to whatever you already use, for example <code>workout</code> or <code>read</code>.
</details>

<details>
<summary><b>Will it overwrite my notes?</b></summary>
No. It only sets the frontmatter keys of your habits (plus <code>identity_xp</code> and <code>identity_focus</code>) through Obsidian's official frontmatter API. It only writes when a value actually changed.
</details>

<details>
<summary><b>Can I log past days?</b></summary>
Yes. Use the ‹ › date navigation in the dashboard header, or click any heatmap cell.
</details>

## 🛠️ Build from source

```bash
git clone https://github.com/EngOREOO/obsidian-identity-habit-tracker.git
cd obsidian-identity-habit-tracker
npm install
npm run build   # strict TypeScript + esbuild → main.js
npm test        # engine smoke test
npm run dev     # watch mode
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the project layout.

## 🗺️ Roadmap

- [ ] Submission to the Obsidian community plugin store
- [ ] Per-habit weekday schedules for standalone habits
- [ ] Weekly report export
- [ ] More languages (contributions welcome — see `src/i18n.ts`)

## 🤝 Contributing & support

Bug reports, ideas and pull requests are welcome. Please open an [issue](https://github.com/EngOREOO/obsidian-identity-habit-tracker/issues).
If the plugin helps you build better habits, **please ⭐ star the repo**. It helps other Obsidian users find it.

## 📄 License

[MIT](LICENSE) © 2026 Ahmed Hany

---

<sub>Keywords: Obsidian habit tracker · Atomic Habits · identity-based habits · streak tracker · consistency score · habit heatmap · daily notes · Dataview · gamification · productivity · PKM · second brain · Arabic RTL plugin</sub>

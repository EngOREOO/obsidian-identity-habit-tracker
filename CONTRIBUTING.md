# Contributing

Thanks for helping improve Habit Streak & Identity Tracker!

## Development setup

```bash
git clone https://github.com/EngOREOO/obsidian-identity-habit-tracker.git
cd obsidian-identity-habit-tracker
npm install
npm run dev     # watch mode, rebuilds main.js on save
```

To test inside Obsidian, symlink or copy the repo folder into `<vault>/.obsidian/plugins/habit-streak-identity-tracker/`
and reload Obsidian. The [Hot-Reload](https://github.com/pjeby/hot-reload) plugin makes this instant.

## Before opening a pull request

```bash
npm run build   # strict TypeScript check + production bundle
npm test        # engine smoke test
```

- Keep CSS selectors namespaced with `iht-`.
- Every user-facing string goes through `src/i18n.ts`. Please add both the English and the Arabic text, or leave the Arabic as English and mention it in the PR.
- Use Obsidian CSS variables so both light and dark themes keep working.

## Project layout

| Path | What lives there |
|---|---|
| `src/main.ts` | Plugin entry: commands, events, state mutations |
| `src/core/engine.ts` | Status resolution, XP, consistency, streaks, freeze & burnout logic |
| `src/analytics/patternDetector.ts` | Smart insights |
| `src/storage/` | `data.json` model, seeds, daily-note YAML sync |
| `src/integrations/bridge.ts` | Optional Habit Journey / Reading Journey integration |
| `src/ui/` | Sidebar view, modals, settings tab |
| `src/reports/` | Monthly Markdown report |

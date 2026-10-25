import { normalizePath, Notice, TFile } from "obsidian";
import type IdentityTrackerPlugin from "../main";
import { levelOf } from "../core/engine";
import { addDays, fmt1, monthKey, range, todayKey } from "../core/dates";
import { detectPatterns } from "../analytics/patternDetector";
import { loc, monthLabel, t } from "../i18n";
import type { I18nKey } from "../i18n";

const esc = (s: string) => String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const row = (cells: (string | number)[]) => "| " + cells.map(c => esc(String(c))).join(" | ") + " |";

function monthBounds(month: string): { from: string; to: string } {
  const from = month + "-01";
  const d = new Date(from + "T00:00:00");
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  const last = from.slice(0, 8) + String(d.getDate()).padStart(2, "0");
  const today = todayKey();
  return { from, to: last > today ? today : last };
}

export function buildReport(plugin: IdentityTrackerPlugin, month: string): string {
  const E = plugin.engine;
  const { from, to } = monthBounds(month);
  const days = range(from, to);
  const habits = E.habits().filter(h => days.some(d => h.applicable(d)));
  const L: string[] = [];

  // per-habit tallies
  const stats = habits.map(h => {
    let done = 0, micro = 0, rest = 0, missed = 0;
    for (const d of days) {
      const s = E.status(h, d);
      if (s === "done") done++; else if (s === "micro") micro++; else if (s === "rest") rest++; else if (s === "missed") missed++;
    }
    const den = done + micro + missed;
    return { h, done, micro, rest, missed, pct: den ? Math.round(((done + micro) / den) * 100) : 0, best: E.bestStreak(h, from, to), cur: E.streak(h, to) };
  });
  const hits = stats.reduce((a, s) => a + s.done + s.micro, 0);
  const den = stats.reduce((a, s) => a + s.done + s.micro + s.missed, 0);
  const overall = den ? Math.round((hits / den) * 100) : 0;
  const monthXp = E.identityTotals(from, to);
  const allXp = E.allTimeTotals(to);
  const totalXp = Object.values(monthXp).reduce((a, b) => a + b, 0);
  const perfect = days.filter(d => { const c = E.dayCounts(d); return c.total > 0 && c.done === c.total; }).length;
  const freeze = E.freezeDates(month).size;
  const best = stats.reduce((m, s) => (s.best > m.best ? { best: s.best, name: loc(s.h.name, s.h.nameAr) } : m), { best: 0, name: "" });

  L.push("---", "type: identity-report", "month: " + month, "generated: " + todayKey(), "consistency: " + overall, "xp: " + fmt1(totalXp), "---", "");
  L.push("# " + t("rTitle", { month: monthLabel(month) }), "", "> " + t("tagline"), "");

  L.push("## " + t("rSummary"), "");
  L.push("| | |", "|---|---:|", row([t("rOverall"), overall + "%"]));
  L.push(row([t("rTotalXp"), fmt1(totalXp)]), row([t("rPerfect"), perfect]), row([t("rFreeze"), freeze + " / " + plugin.data.settings.freezePerMonth]));
  if (best.best) L.push(row([t("rBestStreak"), best.best + " " + t("days") + " — " + best.name]));
  L.push("");

  L.push("## " + t("rIdentities"), "", row([t("colIdentity"), t("colMonthXp"), t("colAllXp"), t("colLevel")]), "|---|---:|---:|---|");
  const achievements: string[] = [];
  for (const i of E.identities) {
    const all = allXp[i.id] || 0;
    const lv = levelOf(all);
    const title = t(lv.key as I18nKey);
    L.push(row([i.icon + " " + loc(i.name, i.nameAr), fmt1(monthXp[i.id] || 0), fmt1(all), lv.emoji + " " + title]));
    if (lv.level > 1) achievements.push(t("achLevel", { identity: loc(i.name, i.nameAr), title, emoji: lv.emoji }));
  }
  L.push("");

  L.push("## " + t("rHabits"), "", row([t("colHabit"), t("colConsistency"), t("colDone"), t("colMicro"), t("colRest"), t("colMissed"), t("colStreak")]), "|---|---:|---:|---:|---:|---:|---:|");
  for (const s of stats.sort((a, b) => b.pct - a.pct)) {
    L.push(row([s.h.icon + " " + loc(s.h.name, s.h.nameAr), s.pct + "%", s.done, s.micro, s.rest, s.missed, s.cur]));
    if (s.best >= 7) achievements.push(t("achStreak", { habit: loc(s.h.name, s.h.nameAr), n: s.best }));
  }
  L.push("");

  const insights = detectPatterns(E, to);
  L.push("## " + t("rInsights"), "");
  if (insights.length) for (const i of insights) L.push("- " + i.text); else L.push("- " + t("insightsEmpty"));
  L.push("");

  const rj = plugin.bridge.rj();
  if (rj) {
    const hours = days.reduce((a, d) => a + plugin.bridge.readingHours(d), 0);
    let finished: string[] = [];
    try { finished = (rj.getBooks?.() || []).filter(b => b.finished && monthKey(String(b.finished)) === month).map(b => b.name); } catch { /* optional */ }
    L.push("## " + t("rReading"), "", "- " + t("rReadingHours") + ": " + fmt1(hours));
    L.push("- " + t("rBooksFinished") + ": " + finished.length + (finished.length ? " — " + finished.map(n => "[[" + n + "]]").join(", ") : ""), "");
  }

  if (perfect) achievements.push(t("achPerfect", { n: perfect }));
  L.push("## " + t("rAchievements"), "");
  if (achievements.length) for (const a of achievements) L.push("- 🏆 " + a); else L.push("- " + t("rNoAchievements"));
  L.push("", "```identity-tracker", "heatmap", "```", "", "*" + t("rGenerated", { date: todayKey() }) + "*", "");
  return L.join("\n");
}

export async function exportReport(plugin: IdentityTrackerPlugin, month = monthKey(todayKey())): Promise<TFile | null> {
  const folder = normalizePath(plugin.data.settings.reportsFolder.trim() || "Reports");
  const path = normalizePath(folder + "/Identity Report " + month + ".md");
  const body = buildReport(plugin, month);
  const vault = plugin.app.vault;
  let cur = "";
  for (const p of folder.split("/")) {
    cur = cur ? cur + "/" + p : p;
    if (!vault.getAbstractFileByPath(cur)) { try { await vault.createFolder(cur); } catch { /* exists */ } }
  }
  const existing = vault.getAbstractFileByPath(path);
  let file: TFile;
  if (existing instanceof TFile) { await vault.modify(existing, body); file = existing; }
  else file = await vault.create(path, body);
  new Notice(t("reportSaved", { path }));
  await plugin.app.workspace.getLeaf(true).openFile(file);
  return file;
}

export const previousMonth = (): string => monthKey(addDays(todayKey().slice(0, 8) + "01", -1));

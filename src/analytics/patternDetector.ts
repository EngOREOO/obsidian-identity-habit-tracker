/**
 * Smart Pattern & Friction Detector — turns the last 60 days of logs into a few actionable insights.
 */
import type { Engine } from "../core/engine";
import type { Insight, Status, TrackedHabit } from "../types";
import { addDays, range, weekday } from "../core/dates";
import { dowName, loc, t } from "../i18n";

const WINDOW = 60;
const hit = (s: Status) => s === "done" || s === "micro";
const counted = (s: Status) => hit(s) || s === "missed";

interface Series { h: TrackedHabit; days: { d: string; ok: boolean }[] }

function series(E: Engine, end: string): Series[] {
  const days = range(addDays(end, -(WINDOW - 1)), end);
  return E.habits().map(h => ({
    h,
    days: days.flatMap(d => {
      const s = E.status(h, d);
      return counted(s) ? [{ d, ok: hit(s) }] : [];
    }),
  }));
}

function friction(list: Series[]): Insight[] {
  const out: Insight[] = [];
  for (const { h, days } of list) {
    if (days.length < 14) continue;
    const rate = days.filter(x => x.ok).length / days.length;
    if (rate < 0.3) continue;
    const weak: number[] = [];
    let worstDrop = 0;
    for (let w = 0; w < 7; w++) {
      const on = days.filter(x => weekday(x.d) === w);
      if (on.length < 2) continue;
      const r = on.filter(x => x.ok).length / on.length;
      const drop = (rate - r) / rate;
      if (drop >= 0.4) { weak.push(w); worstDrop = Math.max(worstDrop, drop); }
    }
    if (!weak.length || weak.length > 3) continue;
    out.push({
      kind: "friction",
      score: worstDrop,
      text: t("insightFriction", { habit: loc(h.name, h.nameAr), pct: Math.round(worstDrop * 100), days: weak.map(dowName).join(t("and")) }),
    });
  }
  return out;
}

function correlation(list: Series[]): Insight[] {
  const out: (Insight & { a: string; b: string })[] = [];
  const maps = list.map(s => ({ h: s.h, m: new Map(s.days.map(x => [x.d, x.ok])) }));
  for (const a of maps) for (const b of maps) {
    if (a === b) continue;
    let withA = 0, bWithA = 0, without = 0, bWithout = 0;
    for (const [d, aOk] of a.m) {
      const bOk = b.m.get(d);
      if (bOk === undefined) continue;
      if (aOk) { withA++; if (bOk) bWithA++; } else { without++; if (bOk) bWithout++; }
    }
    if (withA < 5 || without < 3) continue;
    const p1 = bWithA / withA, p0 = bWithout / without;
    if (p1 - p0 < 0.25) continue;
    const lift = Math.min(300, Math.round(((p1 - p0) / Math.max(p0, 0.1)) * 100));
    out.push({ kind: "correlation", a: a.h.uid, b: b.h.uid, score: p1 - p0, text: t("insightCorrelation", { a: loc(a.h.name, a.h.nameAr), b: loc(b.h.name, b.h.nameAr), pct: lift }) });
  }
  // only the two strongest pairings, so one dominant habit doesn't flood the list
  out.sort((x, y) => y.score - x.score);
  const seen = new Set<string>();
  return out.filter(i => {
    const pair = [i.a, i.b].sort().join("|");
    if (seen.has(pair)) return false;
    seen.add(pair);
    return true;
  }).slice(0, 2).map(({ kind, score, text }) => ({ kind, score, text }));
}

function identityBalance(E: Engine, end: string): Insight[] {
  const out: Insight[] = [];
  const week = E.identityTotals(addDays(end, -6), end);
  const ids = E.identities.filter(i => E.habits().some(h => h.identityId === i.id));
  if (!ids.length) return out;
  const ranked = ids.map(i => ({ i, xp: week[i.id] || 0 })).sort((a, b) => b.xp - a.xp);
  if (ranked[0].xp > 0) out.push({ kind: "identity", score: 0.3, text: t("insightStrong", { identity: loc(ranked[0].i.name, ranked[0].i.nameAr), xp: Math.round(ranked[0].xp) }) });
  const neglected = ranked.find(r => r.xp === 0);
  if (neglected && ranked[0].xp > 0) out.push({ kind: "identity", score: 0.35, text: t("insightNeglected", { identity: loc(neglected.i.name, neglected.i.nameAr) }) });
  return out;
}

function bestDay(list: Series[]): Insight[] {
  const per = Array.from({ length: 7 }, () => ({ ok: 0, n: 0 }));
  for (const s of list) for (const x of s.days) { const w = weekday(x.d); per[w].n++; if (x.ok) per[w].ok++; }
  const total = per.reduce((a, p) => a + p.n, 0);
  if (total < 40) return [];
  let best = -1, bestRate = 0;
  per.forEach((p, w) => { if (p.n >= 5 && p.ok / p.n > bestRate) { bestRate = p.ok / p.n; best = w; } });
  return best >= 0 ? [{ kind: "info", score: 0.2, text: t("insightBestDay", { day: dowName(best), pct: Math.round(bestRate * 100) }) }] : [];
}

export function detectPatterns(E: Engine, end: string, max = 4): Insight[] {
  const list = series(E, end);
  const fr = friction(list).sort((a, b) => b.score - a.score).slice(0, 2);
  const co = correlation(list);
  const rest = [...identityBalance(E, end), ...bestDay(list)];
  return [...fr, ...co, ...rest].slice(0, max);
}

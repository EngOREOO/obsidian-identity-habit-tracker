import type { Identity, LevelInfo, Mark, Status, TrackedHabit, TrackerData } from "../types";
import type { Bridge, HJHabit } from "../integrations/bridge";
import { addDays, fmt1, monthKey, range, todayKey } from "./dates";

export const HEAVY_WEIGHT = 3;
const MAX_HISTORY_DAYS = 1095;

const LEVELS: LevelInfo[] = [
  { level: 1, emoji: "🥉", key: "lvl1", min: 0, next: 30 },
  { level: 2, emoji: "🥈", key: "lvl2", min: 30, next: 100 },
  { level: 3, emoji: "🥇", key: "lvl3", min: 100, next: 250 },
  { level: 4, emoji: "💎", key: "lvl4", min: 250, next: null },
];

export const levelOf = (xp: number): LevelInfo => {
  let out = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.min) out = l;
  return out;
};

export const slugKey = (s: string): string =>
  String(s).toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, "_").replace(/^_+|_+$/g, "") || "habit";

/** Sensible identity-layer defaults for the user's known Habit Journey habits. */
const HJ_DEFAULTS: Record<string, { weight: number; micro: string; microAr: string; identity?: string }> = {
  gym: { weight: 3, micro: "10 mins stretching", microAr: "10 دقائق إطالة" },
  water: { weight: 1, micro: "Drink 1 large glass of water", microAr: "شرب كوب ماء كبير" },
  reading: { weight: 2, micro: "Read 2 pages", microAr: "قراءة صفحتين", identity: "reader" },
  "quran-juz": { weight: 2, micro: "Read 1 page", microAr: "قراءة صفحة واحدة" },
  "quran-page": { weight: 2, micro: "Review 3 verses", microAr: "مراجعة ٣ آيات" },
  prayers: { weight: 2, micro: "Pray the next prayer on time", microAr: "صلِّ الصلاة القادمة في وقتها" },
  plank: { weight: 2, micro: "30-second plank", microAr: "بلانك ٣٠ ثانية" },
  pushups: { weight: 2, micro: "10 push-ups", microAr: "١٠ تمارين ضغط" },
};

export class Engine {
  private memo = new Map<string, Status>();
  private habitCache: TrackedHabit[] | null = null;
  private totalsCache = new Map<string, Record<string, number>>();

  constructor(private data: () => TrackerData, private bridge: Bridge) {}

  invalidate(): void {
    this.memo.clear();
    this.totalsCache.clear();
    this.habitCache = null;
  }

  get identities(): Identity[] {
    return this.data().identities;
  }

  identity(id: string): Identity | undefined {
    return this.data().identities.find(i => i.id === id);
  }

  // ---------------------------------------------------------------- habit registry
  habits(): TrackedHabit[] {
    if (this.habitCache) return this.habitCache;
    const D = this.data();
    const out: TrackedHabit[] = [];
    for (const n of D.habits) {
      if (n.archived) continue;
      out.push({
        uid: "n:" + n.id, source: "native", sourceId: n.id, identityId: n.identityId,
        name: n.name, nameAr: n.nameAr, yamlKey: n.yamlKey || slugKey(n.name), weight: Math.max(0.5, n.weight || 1),
        micro: n.micro, microAr: n.microAr, icon: n.icon || "•", auto: false, active: true,
        applicable: date => date >= n.created,
        externalDone: () => false,
        externalPartial: () => false,
      });
    }
    const hj = this.bridge.hj();
    if (hj) {
      const first = this.bridge.hjFirstDay();
      for (const h of hj.settings.habits) out.push(this.fromHj(h, first));
    }
    this.habitCache = out;
    return out;
  }

  private fromHj(h: HJHabit, first: string): TrackedHabit {
    const D = this.data();
    const uid = "hj:" + h.id;
    const m = D.meta[uid] || {};
    const def = HJ_DEFAULTS[h.id];
    const byGroup = D.identities.find(i => h.group && i.groups.includes(h.group));
    const identityId = m.identityId ?? (def?.identity && this.identity(def.identity) ? def.identity : byGroup?.id) ?? "";
    const reading = h.type === "reading" && !!this.bridge.rj();
    const b = this.bridge;
    return {
      uid, source: "habit-journey", sourceId: h.id, identityId,
      name: h.name || h.id, nameAr: m.nameAr, yamlKey: m.yamlKey || slugKey(h.id),
      weight: Math.max(0.5, m.weight ?? def?.weight ?? 1),
      micro: m.micro ?? def?.micro ?? "", microAr: m.microAr ?? def?.microAr,
      icon: m.icon || h.emoji || "•",
      auto: b.hjIsAuto(h),
      active: !h.archivedAt && (!h.end || todayKey() <= h.end) && (!h.autoEnd || todayKey() <= h.autoEnd),
      badge: reading ? "RJ" : "HJ",
      progress: date => {
        if (h.type === "count" || reading) {
          const unit = reading ? "h" : h.unit ? " " + h.unit : "";
          return fmt1(b.hjValue(h, date)) + "/" + fmt1(b.hjTarget(h)) + unit;
        }
        return null;
      },
      applicable: date => (!first || date >= first) && b.hjApplicable(h, date),
      externalDone: date => b.hjIsDone(h, date),
      externalPartial: date => (h.type === "count" || reading) && b.hjValue(h, date) > 0 && !b.hjIsDone(h, date),
    };
  }

  habit(uid: string): TrackedHabit | undefined {
    return this.habits().find(h => h.uid === uid);
  }

  /** Habits shown on a given day (applicable that date). */
  habitsOn(date: string): TrackedHabit[] {
    return this.habits().filter(h => h.applicable(date));
  }

  // ---------------------------------------------------------------- status & xp
  mark(uid: string, date: string): Mark | undefined {
    return this.data().log[date]?.[uid];
  }

  status(h: TrackedHabit, date: string): Status {
    const key = h.uid + "|" + date;
    const hit = this.memo.get(key);
    if (hit) return hit;
    let s: Status;
    const today = todayKey();
    if (!h.applicable(date)) s = "na";
    else if (h.externalDone(date)) s = "done";
    else {
      const m = this.mark(h.uid, date);
      if (m) s = m;
      else if (h.externalPartial(date)) s = "micro";
      else if (this.data().dayFreeze[date]) s = "rest";
      else s = date >= today ? "pending" : "missed";
    }
    this.memo.set(key, s);
    return s;
  }

  focusOn(date: string): string {
    return this.data().focus[date] || "";
  }

  multiplier(h: TrackedHabit, date: string): number {
    const f = this.focusOn(date);
    return f && f === h.identityId ? 2 : 1;
  }

  xp(h: TrackedHabit, date: string): number {
    const s = this.status(h, date);
    const base = s === "done" ? h.weight : s === "micro" ? h.weight * 0.5 : 0;
    return base * this.multiplier(h, date);
  }

  /** Potential XP for a full completion (used for notices). */
  fullXp(h: TrackedHabit, date: string, micro = false): number {
    return (micro ? h.weight * 0.5 : h.weight) * this.multiplier(h, date);
  }

  dayXp(date: string): number {
    let x = 0;
    for (const h of this.habits()) x += this.xp(h, date);
    return x;
  }

  dayCounts(date: string): { done: number; total: number; rest: boolean } {
    let done = 0, total = 0, rest = false;
    for (const h of this.habitsOn(date)) {
      const s = this.status(h, date);
      if (s === "rest") { rest = true; continue; }
      total++;
      if (s === "done" || s === "micro") done++;
    }
    return { done, total, rest: rest || !!this.data().dayFreeze[date] };
  }

  firstDay(): string {
    const today = todayKey();
    const floor = addDays(today, -MAX_HISTORY_DAYS);
    const D = this.data();
    let first = today;
    for (const k of Object.keys(D.log)) if (k < first) first = k;
    for (const n of D.habits) if (n.created && n.created < first) first = n.created;
    const hjFirst = this.bridge.hjFirstDay();
    if (hjFirst && hjFirst < first) first = hjFirst;
    return first < floor ? floor : first;
  }

  /** XP per identity over [from, to]. "" collects unassigned habits. */
  identityTotals(from: string, to: string): Record<string, number> {
    const key = from + "|" + to;
    const hit = this.totalsCache.get(key);
    if (hit) return hit;
    const out: Record<string, number> = {};
    for (const i of this.identities) out[i.id] = 0;
    const hs = this.habits();
    for (const d of range(from, to)) for (const h of hs) {
      const x = this.xp(h, d);
      if (x) out[h.identityId] = (out[h.identityId] || 0) + x;
    }
    this.totalsCache.set(key, out);
    return out;
  }

  allTimeTotals(upTo = todayKey()): Record<string, number> {
    return this.identityTotals(this.firstDay(), upTo);
  }

  // ---------------------------------------------------------------- consistency & streaks
  consistency(h: TrackedHabit, end: string, days = 30): { hits: number; den: number; pct: number } {
    let hits = 0, den = 0;
    for (const d of range(addDays(end, -(days - 1)), end)) {
      const s = this.status(h, d);
      if (s === "done" || s === "micro") { hits++; den++; }
      else if (s === "missed") den++;
    }
    return { hits, den, pct: den ? Math.round((hits / den) * 100) : 0 };
  }

  overallConsistency(end: string, days = 30, habits = this.habits()): { hits: number; den: number; pct: number } {
    let hits = 0, den = 0;
    for (const h of habits) { const c = this.consistency(h, end, days); hits += c.hits; den += c.den; }
    return { hits, den, pct: den ? Math.round((hits / den) * 100) : 0 };
  }

  streak(h: TrackedHabit, date: string): number {
    const first = this.firstDay();
    let d = date, cur = 0;
    if (this.status(h, d) === "pending") d = addDays(d, -1);
    for (let i = 0; i < MAX_HISTORY_DAYS && d >= first; i++, d = addDays(d, -1)) {
      const s = this.status(h, d);
      if (s === "done" || s === "micro") cur++;
      else if (s === "missed" || s === "pending") break;
      // "na" and "rest" neither extend nor break the chain
    }
    return cur;
  }

  bestStreak(h: TrackedHabit, from: string, to: string): number {
    let best = 0, run = 0;
    for (const d of range(from, to)) {
      const s = this.status(h, d);
      if (s === "done" || s === "micro") { run++; best = Math.max(best, run); }
      else if (s === "missed") run = 0;
    }
    return best;
  }

  private previousOccurrence(h: TrackedHabit, date: string, maxBack = 14): string | null {
    for (let i = 1; i <= maxBack; i++) {
      const d = addDays(date, -i);
      if (h.applicable(d)) return d;
    }
    return null;
  }

  /** Consecutive missed scheduled occurrences strictly before `date`. */
  missedRun(h: TrackedHabit, date: string): number {
    let n = 0, d = date;
    for (let i = 0; i < 30; i++) {
      const p = this.previousOccurrence(h, d);
      if (!p) break;
      if (this.status(h, p) !== "missed") break;
      n++;
      d = p;
    }
    return n;
  }

  isCritical(h: TrackedHabit, date: string): boolean {
    const s = this.status(h, date);
    if (s !== "pending" && s !== "missed") return false;
    const p = this.previousOccurrence(h, date);
    return !!p && this.status(h, p) === "missed";
  }

  needsMicro(h: TrackedHabit, date: string): number {
    const s = this.status(h, date);
    if (s !== "pending" && s !== "missed") return 0;
    const n = this.missedRun(h, date);
    return n >= 3 ? n : 0;
  }

  // ---------------------------------------------------------------- grace system
  freezeDates(month: string): Set<string> {
    const D = this.data();
    const out = new Set<string>();
    for (const d of Object.keys(D.dayFreeze)) if (D.dayFreeze[d] && monthKey(d) === month) out.add(d);
    for (const d of Object.keys(D.log)) {
      if (monthKey(d) !== month) continue;
      if (Object.values(D.log[d]).includes("rest")) out.add(d);
    }
    return out;
  }

  freezeLeft(month: string): number {
    return Math.max(0, this.data().settings.freezePerMonth - this.freezeDates(month).size);
  }

  /** Can a rest mark be placed on `date` without exceeding the monthly allowance? */
  canFreeze(date: string): boolean {
    const used = this.freezeDates(monthKey(date));
    return used.has(date) || used.size < this.data().settings.freezePerMonth;
  }

  // ---------------------------------------------------------------- energy balance
  dayLoad(date: string): number {
    let w = 0;
    for (const h of this.habits()) { const s = this.status(h, date); if (s === "done") w += h.weight; else if (s === "micro") w += h.weight * 0.5; }
    return w;
  }

  /** Consecutive days (ending at `date`, or the day before if today is still open) with >90% heavy-habit completion. */
  heavyRun(date: string): number {
    const heavyDay = (d: string): boolean | null => {
      const hs = this.habitsOn(d).filter(h => h.weight >= HEAVY_WEIGHT);
      let total = 0, done = 0;
      for (const h of hs) {
        const s = this.status(h, d);
        if (s === "rest" || s === "na") continue;
        total++;
        if (s === "done") done++;
      }
      if (!total) return null;
      return done / total > 0.9;
    };
    let d = date, n = 0;
    if (heavyDay(d) !== true) d = addDays(d, -1);
    for (let i = 0; i < 60; i++, d = addDays(d, -1)) {
      if (heavyDay(d) === true) n++;
      else break;
    }
    return n;
  }
}

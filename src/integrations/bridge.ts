/**
 * Bridge to the user's companion plugins:
 *  - Habit Journey   (id "habit-journey")   — source of truth for habits & completion values
 *  - Reading Journey (id "reading-journey") — daily reading hours, books, daily-notes folder
 *
 * Neither plugin exports its helpers, so the scheduling / completion rules of Habit Journey
 * are ported here 1:1 (see habit-journey/main.js `scheduled`, `applicable`, `targetOf`, `valueOf`).
 * The plugin instances are resolved lazily on every call: load order is undefined and either
 * plugin can be disabled or reloaded mid-session.
 */
import type { App, TFile } from "obsidian";
import { diffDays, num, parseDay } from "../core/dates";

export const HJ_ID = "habit-journey";
export const RJ_ID = "reading-journey";

export interface Renderer { render(): void }

export interface HJHabit {
  id: string;
  name: string;
  group?: string;
  type?: "check" | "count" | "reading" | string;
  target?: number;
  step?: number;
  unit?: string;
  emoji?: string;
  created?: string;
  start?: string;
  end?: string;
  autoEnd?: string;
  archivedAt?: string;
  every?: number;
  days?: number[];
  link?: { type?: string; ids?: string[]; mode?: string; match?: string };
}

export interface HJPlugin {
  settings: {
    challengeStart?: string;
    habits: HJHabit[];
    log: Record<string, Record<string, number>>;
  };
  renderers?: Set<Renderer>;
  setValue(date: string, id: string, v: number): void;
  addHabit(h: Partial<HJHabit>): void;
  commit(): void;
  findDailyNote?(date: string): Promise<TFile | null>;
}

export interface RJBook { name: string; status?: string; finished?: string; pages?: number }

export interface RJPlugin {
  settings: { hours?: Record<string, number>; dailyHours?: number; dailyNoteFolder?: string };
  renderers?: Set<Renderer>;
  getBooks?(): RJBook[];
  refreshSoon?(): void;
}

// `app.plugins` / `app.internalPlugins` are not part of obsidian.d.ts.
type LooseApp = App & {
  plugins?: { plugins?: Record<string, unknown> };
  internalPlugins?: { plugins?: Record<string, { enabled?: boolean; instance?: { options?: { folder?: string; format?: string } } }> };
};

export class Bridge {
  private hooked = new Map<Set<Renderer>, Renderer>();

  constructor(private app: App, private hook: Renderer, private enabled: () => { hj: boolean; rj: boolean }) {}

  private raw(id: string): unknown {
    return (this.app as LooseApp).plugins?.plugins?.[id];
  }

  hj(): HJPlugin | null {
    if (!this.enabled().hj) return null;
    const p = this.raw(HJ_ID) as HJPlugin | undefined;
    if (!p || !p.settings || !Array.isArray(p.settings.habits)) return null;
    if (!p.settings.log) p.settings.log = {};
    this.attach(p.renderers);
    return p;
  }

  rj(): RJPlugin | null {
    if (!this.enabled().rj) return null;
    const p = this.raw(RJ_ID) as RJPlugin | undefined;
    if (!p || !p.settings) return null;
    this.attach(p.renderers);
    return p;
  }

  /** Subscribe to the companion's refresh cycle by registering as one of its renderers. */
  private attach(set: Set<Renderer> | undefined): void {
    if (!set || typeof set.add !== "function" || this.hooked.has(set)) return;
    set.add(this.hook);
    this.hooked.set(set, this.hook);
  }

  detachAll(): void {
    for (const [set, r] of this.hooked) set.delete(r);
    this.hooked.clear();
  }

  coreDailyNotes(): { folder: string; format: string } | null {
    const dn = (this.app as LooseApp).internalPlugins?.plugins?.["daily-notes"];
    if (!dn || !dn.enabled) return null;
    const o = dn.instance?.options || {};
    return { folder: o.folder || "", format: o.format || "" };
  }

  // ---------------------------------------------------------------- Reading Journey
  readingHours(date: string): number {
    const rj = this.rj();
    return rj ? num((rj.settings.hours || {})[date]) : 0;
  }

  readingTarget(): number {
    const rj = this.rj();
    return rj ? num(rj.settings.dailyHours) || 3 : 3;
  }

  // ---------------------------------------------------------------- Habit Journey rules (ported)
  hjStart(h: HJHabit): string {
    return h.start || h.created || "";
  }

  private scheduled(h: HJHabit, date: string): boolean {
    if (num(h.every) > 1) {
      const a = this.hjStart(h);
      if (a) {
        const diff = diffDays(date, a);
        return diff >= 0 && diff % num(h.every) === 0;
      }
    }
    if (Array.isArray(h.days) && h.days.length) return h.days.includes(parseDay(date).getDay());
    return true;
  }

  hjApplicable(h: HJHabit, date: string): boolean {
    const s = this.hjStart(h);
    return (!s || s <= date) && (!h.end || date <= h.end) && (!h.autoEnd || date <= h.autoEnd)
      && (!h.archivedAt || date < h.archivedAt) && this.scheduled(h, date);
  }

  private linkOf(h: HJHabit): HJHabit["link"] | null {
    return h.link && h.link.type ? h.link : null;
  }

  hjIsAuto(h: HJHabit): boolean {
    return !!this.linkOf(h) || (h.type === "reading" && !!this.rj());
  }

  hjTarget(h: HJHabit): number {
    if (this.linkOf(h)) return 1;
    if (h.type === "reading" && this.rj()) return Math.max(0.1, this.readingTarget());
    if (h.type === "count") return Math.max(1, num(h.target) || 1);
    return 1;
  }

  hjValue(h: HJHabit, date: string, depth = 0): number {
    const hj = this.hj();
    if (!hj) return 0;
    const link = this.linkOf(h);
    if (link) {
      if (link.type !== "habit" || depth > 4) return 0; // task links depend on Habit Journey's private cache
      const hs = hj.settings.habits.filter(x => (link.ids || []).includes(x.id) && x.id !== h.id && this.hjApplicable(x, date));
      if (!hs.length) return 0;
      const f = (x: HJHabit) => this.hjIsDone(x, date, depth + 1);
      return (link.mode === "any" ? hs.some(f) : hs.every(f)) ? 1 : 0;
    }
    if (h.type === "reading" && this.rj()) return this.readingHours(date);
    return num((hj.settings.log[date] || {})[h.id]);
  }

  hjIsDone(h: HJHabit, date: string, depth = 0): boolean {
    return this.hjValue(h, date, depth) >= this.hjTarget(h) - 1e-9;
  }

  hjSetDone(h: HJHabit, date: string, done: boolean): boolean {
    const hj = this.hj();
    if (!hj || this.hjIsAuto(h)) return false;
    hj.setValue(date, h.id, done ? this.hjTarget(h) : 0);
    return true;
  }

  /** Earliest day Habit Journey has any data for (bounds analytics so pre-history is not "missed"). */
  hjFirstDay(): string {
    const hj = this.hj();
    if (!hj) return "";
    const keys = Object.keys(hj.settings.log).sort();
    const cs = hj.settings.challengeStart || "";
    if (keys.length && (!cs || keys[0] < cs)) return keys[0];
    return cs;
  }

  async findDailyNote(date: string): Promise<TFile | null> {
    const hj = this.hj();
    if (hj && typeof hj.findDailyNote === "function") {
      try { return await hj.findDailyNote(date); } catch { return null; }
    }
    return null;
  }
}

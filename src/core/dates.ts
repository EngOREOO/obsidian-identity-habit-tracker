export const DAY_MS = 86400000;

const pad2 = (n: number): string => String(n).padStart(2, "0");

export const ymd = (d: Date): string => d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
export const parseDay = (s: string): Date => new Date(s + "T00:00:00");
export const todayKey = (): string => ymd(new Date());
export const addDays = (key: string, n: number): string => {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
export const diffDays = (a: string, b: string): number => Math.round((parseDay(a).getTime() - parseDay(b).getTime()) / DAY_MS);
export const weekday = (key: string): number => parseDay(key).getDay();
export const monthKey = (key: string): string => key.slice(0, 7);

/** Inclusive list of day keys from `from` to `to`. */
export function range(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

export const dateStr = (v: unknown): string => {
  if (!v) return "";
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
};

export const num = (v: unknown): number => {
  const n = Number(v);
  return isFinite(n) ? n : 0;
};

export const fmt1 = (n: number): string => String(Math.round(n * 10) / 10);

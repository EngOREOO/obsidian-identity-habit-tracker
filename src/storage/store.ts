import { DEFAULT_SETTINGS, type Identity, type NativeHabit, type TrackerData } from "../types";
import { todayKey } from "../core/dates";

export const uid = (p = "i"): string => p + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);

export function defaultData(): TrackerData {
  return {
    version: 1,
    lang: "en",
    identities: [],
    habits: [],
    meta: {},
    log: {},
    dayFreeze: {},
    focus: {},
    settings: { ...DEFAULT_SETTINGS },
    seeded: false,
    hjSeeded: false,
    ui: { tab: "today" },
  };
}

/** Merge whatever is on disk with current defaults (forward-compatible loading). */
export function normalize(raw: unknown): TrackerData {
  const base = defaultData();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<TrackerData>;
  return {
    ...base,
    ...r,
    identities: Array.isArray(r.identities) ? r.identities.map(i => ({ ...i, groups: Array.isArray(i.groups) ? i.groups : [] })) : [],
    habits: Array.isArray(r.habits) ? r.habits : [],
    meta: r.meta && typeof r.meta === "object" ? r.meta : {},
    log: r.log && typeof r.log === "object" ? r.log : {},
    dayFreeze: r.dayFreeze && typeof r.dayFreeze === "object" ? r.dayFreeze : {},
    focus: r.focus && typeof r.focus === "object" ? r.focus : {},
    settings: { ...DEFAULT_SETTINGS, ...(r.settings || {}) },
    ui: { ...base.ui, ...(r.ui || {}) },
  };
}

export const SEED_IDENTITIES: Identity[] = [
  { id: "athlete", name: "Athlete", nameAr: "الرياضي", icon: "🏋️", groups: ["Body"] },
  { id: "reader", name: "Reader & Researcher", nameAr: "القارئ والباحث", icon: "📚", groups: ["Study"] },
  { id: "creator", name: "Creator & Builder", nameAr: "المبدع والمصمم", icon: "🛠️", groups: [] },
];

/** Identities proposed for Habit Journey groups that the spec seeds do not cover. */
const GROUP_IDENTITIES: Record<string, Omit<Identity, "groups">> = {
  Deen: { id: "devout", name: "Devout Believer", nameAr: "المؤمن الملتزم", icon: "🕌" },
  Mind: { id: "mindful", name: "Mindful Mind", nameAr: "العقل الواعي", icon: "🧘" },
  Body: { id: "athlete", name: "Athlete", nameAr: "الرياضي", icon: "🏋️" },
  Study: { id: "reader", name: "Reader & Researcher", nameAr: "القارئ والباحث", icon: "📚" },
};

export function seedNativeHabits(): NativeHabit[] {
  const created = todayKey();
  const h = (id: string, identityId: string, name: string, nameAr: string, weight: number, micro: string, microAr: string, icon: string): NativeHabit =>
    ({ id, identityId, name, nameAr, yamlKey: id, weight, micro, microAr, icon, created });
  return [
    h("gym_workout", "athlete", "Gym / Calisthenics", "الجيم / الكاليستنكس", 3, "10 mins stretching", "10 دقائق إطالة", "🏋️"),
    h("hydration", "athlete", "Hydration", "شرب الماء", 1, "Drink 1 large glass of water", "شرب كوب ماء كبير", "💧"),
    h("reading", "reader", "Deep Reading", "القراءة العميقة", 2, "Read 2 pages", "قراءة صفحتين", "📖"),
    h("skill_practice", "reader", "Language / Skill Practice", "ممارسة لغة / مهارة", 2, "5 mins practice", "5 دقائق ممارسة", "🗣️"),
    h("deep_work", "creator", "Deep Work / Coding", "العمل العميق / البرمجة", 3, "15 mins focused session", "15 دقيقة تركيز", "💻"),
  ];
}

/** Ensure every Habit Journey group is claimed by some identity. Returns how many identities were created. */
export function mapGroups(data: TrackerData, groups: string[]): number {
  let created = 0;
  for (const g of groups) {
    if (!g || data.identities.some(i => i.groups.includes(g))) continue;
    const preset = GROUP_IDENTITIES[g];
    const existing = preset && data.identities.find(i => i.id === preset.id);
    if (existing) { existing.groups.push(g); continue; }
    const id = preset && !data.identities.some(i => i.id === preset.id) ? preset.id : uid("id");
    data.identities.push({ id, name: preset?.name || g, nameAr: preset?.nameAr, icon: preset?.icon || "✨", groups: [g] });
    created++;
  }
  return created;
}

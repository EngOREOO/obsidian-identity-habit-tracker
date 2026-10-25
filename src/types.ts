export type Lang = "en" | "ar";

/** What the user recorded for a habit on a day (stored in data.json). */
export type Mark = "done" | "micro" | "rest";

/** The resolved state of a habit on a day, after merging every source. */
export type Status = "done" | "micro" | "rest" | "missed" | "pending" | "na";

export type HabitSource = "native" | "habit-journey";

export interface Identity {
  id: string;
  name: string;
  nameAr?: string;
  icon: string;
  /** Habit Journey groups whose habits vote for this identity by default. */
  groups: string[];
}

/** A habit owned by this plugin (used when Habit Journey is absent, or chosen explicitly). */
export interface NativeHabit {
  id: string;
  identityId: string;
  name: string;
  nameAr?: string;
  yamlKey: string;
  weight: number;
  micro: string;
  microAr?: string;
  icon: string;
  created: string;
  archived?: boolean;
}

/** Identity-layer metadata stored for a Habit Journey habit (never written onto Habit Journey itself). */
export interface HabitMeta {
  identityId?: string;
  nameAr?: string;
  yamlKey?: string;
  weight?: number;
  micro?: string;
  microAr?: string;
  icon?: string;
}

/** Unified habit model consumed by analytics and UI. */
export interface TrackedHabit {
  uid: string;
  source: HabitSource;
  sourceId: string;
  identityId: string;
  name: string;
  nameAr?: string;
  yamlKey: string;
  weight: number;
  micro: string;
  microAr?: string;
  icon: string;
  /** Completion is derived automatically (Reading Journey hours or a Habit Journey link). */
  auto: boolean;
  /** Not archived / ended — shown in the settings list regardless of today's schedule. */
  active: boolean;
  /** Short label for the external source, e.g. "HJ", "RJ". */
  badge?: string;
  /** "2/5" style progress for count habits. */
  progress?: (date: string) => string | null;
  applicable: (date: string) => boolean;
  /** Full completion according to the external source. */
  externalDone: (date: string) => boolean;
  /** Partial progress according to the external source (counts as a micro-version). */
  externalPartial: (date: string) => boolean;
}

export interface TrackerSettings {
  dailyFolder: string;
  dateFormat: string;
  syncFrontmatter: boolean;
  autoCreateDailyNote: boolean;
  freezePerMonth: number;
  reportsFolder: string;
  heatmapDays: 90 | 365;
  useHabitJourney: boolean;
  useReadingJourney: boolean;
  showStatusBar: boolean;
}

export interface TrackerData {
  version: number;
  lang: Lang;
  identities: Identity[];
  habits: NativeHabit[];
  meta: Record<string, HabitMeta>;
  /** log[date][habitUid] */
  log: Record<string, Record<string, Mark>>;
  dayFreeze: Record<string, boolean>;
  focus: Record<string, string>;
  settings: TrackerSettings;
  seeded: boolean;
  hjSeeded: boolean;
  ui: { tab: "today" | "identities" | "analytics" };
}

export const DEFAULT_SETTINGS: TrackerSettings = {
  dailyFolder: "",
  dateFormat: "YYYY-MM-DD",
  syncFrontmatter: true,
  autoCreateDailyNote: true,
  freezePerMonth: 2,
  reportsFolder: "Reports",
  heatmapDays: 90,
  useHabitJourney: true,
  useReadingJourney: true,
  showStatusBar: true,
};

export interface LevelInfo {
  level: 1 | 2 | 3 | 4;
  emoji: string;
  key: "lvl1" | "lvl2" | "lvl3" | "lvl4";
  min: number;
  next: number | null;
}

export interface Insight {
  kind: "friction" | "correlation" | "identity" | "info";
  text: string;
  score: number;
}

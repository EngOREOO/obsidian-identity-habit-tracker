import { ItemView, Menu, setIcon, type WorkspaceLeaf } from "obsidian";
import type IdentityTrackerPlugin from "../main";
import type { Identity, Mark, Status, TrackedHabit } from "../types";
import { levelOf } from "../core/engine";
import { addDays, fmt1, monthKey, range, todayKey, weekday } from "../core/dates";
import { detectPatterns } from "../analytics/patternDetector";
import { exportReport } from "../reports/reportGenerator";
import { dir, getLang, loc, niceDate, t } from "../i18n";
import type { I18nKey } from "../i18n";
import { HabitModal, IdentityModal } from "./Modals";

export const VIEW_TYPE = "identity-habit-tracker-view";

type Tab = "today" | "identities" | "analytics";

// ---------------------------------------------------------------- tiny DOM helpers
function button(parent: HTMLElement, opts: { text?: string; icon?: string; cls?: string; tip?: string; onClick: (e: MouseEvent) => void }): HTMLButtonElement {
  const b = parent.createEl("button", { cls: "iht-btn" + (opts.cls ? " " + opts.cls : "") });
  if (opts.icon) setIcon(b.createSpan({ cls: "iht-btn-icon" }), opts.icon);
  if (opts.text) b.createSpan({ text: opts.text });
  if (opts.tip) b.setAttr("aria-label", opts.tip);
  b.addEventListener("click", e => { e.stopPropagation(); opts.onClick(e); });
  return b;
}

function bar(parent: HTMLElement, pct: number, cls = ""): HTMLElement {
  const track = parent.createDiv({ cls: "iht-bar" + (cls ? " " + cls : "") });
  track.createDiv({ cls: "iht-bar-fill" }).style.width = Math.max(0, Math.min(100, pct)) + "%";
  return track;
}

const identityName = (i: Identity | undefined): string => (i ? loc(i.name, i.nameAr) : t("unassigned"));

function prepareRoot(root: HTMLElement): void {
  root.empty();
  root.addClass("iht-root");
  root.setAttr("dir", dir());
  root.toggleClass("iht-rtl", getLang() === "ar");
}

// ---------------------------------------------------------------- view
export class IdentitySidebarView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private plugin: IdentityTrackerPlugin) { super(leaf); }
  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return t("appName"); }
  getIcon(): string { return "target"; }
  async onOpen(): Promise<void> { this.plugin.renderers.add(this); this.render(); }
  async onClose(): Promise<void> { this.plugin.renderers.delete(this); }
  render(): void { renderDashboard(this.plugin, this.contentEl); }
}

export function renderDashboard(plugin: IdentityTrackerPlugin, root: HTMLElement): void {
  const scroll = root.scrollTop;
  prepareRoot(root);
  root.addClass("iht-dashboard");
  const today = todayKey();
  if (plugin.ui.date > today) plugin.ui.date = today;
  const date = plugin.ui.date;

  renderHeader(plugin, root, date, today);

  const tabs = root.createDiv({ cls: "iht-tabs", attr: { role: "tablist" } });
  const cur = plugin.data.ui.tab;
  const tabDefs: [Tab, I18nKey, string][] = [["today", "tabToday", "check-circle-2"], ["identities", "tabIdentities", "award"], ["analytics", "tabAnalytics", "bar-chart-3"]];
  for (const [id, key, icon] of tabDefs) {
    const b = button(tabs, { text: t(key), icon, cls: "iht-tab" + (cur === id ? " is-active" : ""), onClick: () => { plugin.data.ui.tab = id; plugin.saveSoon(); plugin.refresh(); } });
    b.setAttr("role", "tab");
    b.setAttr("aria-selected", String(cur === id));
  }

  const body = root.createDiv({ cls: "iht-body" });
  if (cur === "today") renderToday(plugin, body, date);
  else if (cur === "identities") renderIdentities(plugin, body, date);
  else renderAnalytics(plugin, body, date);
  root.scrollTop = scroll;
}

function langSwitch(plugin: IdentityTrackerPlugin, parent: HTMLElement): void {
  const sw = parent.createDiv({ cls: "iht-lang", attr: { role: "group", "aria-label": t("langToggle") } });
  for (const [l, label] of [["en", "EN"], ["ar", "عربي"]] as const) {
    const b = sw.createEl("button", { cls: "iht-lang-opt" + (getLang() === l ? " is-active" : ""), text: label });
    b.addEventListener("click", () => { if (getLang() !== l) void plugin.toggleLang(); });
  }
}

function renderHeader(plugin: IdentityTrackerPlugin, root: HTMLElement, date: string, today: string): void {
  const head = root.createDiv({ cls: "iht-head" });
  const top = head.createDiv({ cls: "iht-head-top" });
  const titles = top.createDiv({ cls: "iht-titles" });
  titles.createDiv({ cls: "iht-title", text: t("appName") });
  titles.createDiv({ cls: "iht-tagline", text: t("tagline") });
  const actions = top.createDiv({ cls: "iht-head-actions" });
  langSwitch(plugin, actions);
  button(actions, {
    icon: "plus", cls: "iht-icon-btn mod-cta", tip: t("add"),
    onClick: e => {
      const m = new Menu();
      m.addItem(i => i.setTitle(t("addHabit")).setIcon("list-plus").onClick(() => new HabitModal(plugin, null).open()));
      m.addItem(i => i.setTitle(t("addIdentity")).setIcon("user-plus").onClick(() => new IdentityModal(plugin, null).open()));
      m.showAtMouseEvent(e);
    },
  });
  button(actions, { icon: "settings", cls: "iht-icon-btn", tip: t("settings"), onClick: () => plugin.openSettings() });

  const nav = head.createDiv({ cls: "iht-datenav" });
  const rtl = getLang() === "ar";
  button(nav, { icon: rtl ? "chevron-right" : "chevron-left", cls: "iht-icon-btn", tip: t("prevDay"), onClick: () => { plugin.ui.date = addDays(date, -1); plugin.refresh(); } });
  const label = nav.createEl("button", { cls: "iht-date-label" + (date === today ? " is-today" : "") });
  label.createSpan({ cls: "iht-date-main", text: date === today ? t("today") : date === addDays(today, -1) ? t("yesterday") : niceDate(date) });
  if (date === today || date === addDays(today, -1)) label.createSpan({ cls: "iht-date-sub", text: niceDate(date) });
  label.setAttr("aria-label", t("backToToday"));
  label.addEventListener("click", () => { plugin.ui.date = today; plugin.refresh(); });
  const next = button(nav, { icon: rtl ? "chevron-left" : "chevron-right", cls: "iht-icon-btn", tip: t("nextDay"), onClick: () => { if (date < today) { plugin.ui.date = addDays(date, 1); plugin.refresh(); } } });
  next.disabled = date >= today;
}

// ---------------------------------------------------------------- today
function renderToday(plugin: IdentityTrackerPlugin, body: HTMLElement, date: string): void {
  const E = plugin.engine, D = plugin.data;
  renderFocus(plugin, body, date);

  const stats = body.createDiv({ cls: "iht-stats" });
  const tile = (value: string, label: string, cls = "") => {
    const el = stats.createDiv({ cls: "iht-stat" + (cls ? " " + cls : "") });
    el.createDiv({ cls: "iht-stat-value", text: value });
    el.createDiv({ cls: "iht-stat-label", text: label });
    return el;
  };
  tile("⚡ " + fmt1(E.dayXp(date)), t("todayXp"));
  tile(E.overallConsistency(date).pct + "%", t("consistency30"), "is-primary");
  const fl = E.freezeLeft(monthKey(date));
  tile("❄️ " + fl + "/" + D.settings.freezePerMonth, t("freezeLeft"));

  const frozen = !!D.dayFreeze[date];
  const fz = body.createDiv({ cls: "iht-freeze-row" });
  if (frozen) fz.createDiv({ cls: "iht-note is-rest", text: t("dayFrozen") });
  button(fz, { text: frozen ? t("unfreezeDay") : t("freezeDay"), icon: "snowflake", cls: "iht-freeze-btn" + (frozen ? " is-active" : ""), onClick: () => plugin.toggleDayFreeze(date) });

  const run = E.heavyRun(date);
  if (run >= 6) {
    const b = body.createDiv({ cls: "iht-banner is-burnout" });
    b.createDiv({ cls: "iht-banner-title", text: "🛡️ " + t("burnoutTitle") });
    b.createDiv({ cls: "iht-banner-text", text: t("burnoutBody", { n: run }) });
    if (!frozen) button(b, { text: t("takeRecovery"), icon: "bed", onClick: () => plugin.toggleDayFreeze(date) });
  }

  const habits = E.habitsOn(date);
  if (!E.habits().length) {
    const empty = body.createDiv({ cls: "iht-empty" });
    empty.createDiv({ text: t("noHabits") });
    button(empty, { text: t("addHabit"), icon: "plus", cls: "mod-cta", onClick: () => new HabitModal(plugin, null).open() });
    return;
  }
  const groups: (Identity | undefined)[] = [...D.identities, undefined];
  const focus = E.focusOn(date);
  for (const i of groups) {
    const id = i ? i.id : "";
    const list = habits.filter(h => (i ? h.identityId === i.id : !D.identities.some(x => x.id === h.identityId)));
    if (!list.length) continue;
    const sec = body.createDiv({ cls: "iht-group" + (focus && focus === id ? " is-focus" : "") });
    const gh = sec.createDiv({ cls: "iht-group-head" });
    const xpAll = i ? E.allTimeTotals()[i.id] || 0 : 0;
    gh.createSpan({ cls: "iht-group-icon", text: i ? i.icon : "•" });
    gh.createSpan({ cls: "iht-group-name", text: identityName(i) });
    if (i) gh.createSpan({ cls: "iht-group-level", text: levelOf(xpAll).emoji, attr: { "aria-label": t(levelOf(xpAll).key as I18nKey) } });
    if (focus && focus === id) gh.createSpan({ cls: "iht-chip is-focus", text: t("doubleXp") });
    const done = list.filter(h => { const s = E.status(h, date); return s === "done" || s === "micro"; }).length;
    gh.createSpan({ cls: "iht-group-count", text: done + "/" + list.length });
    for (const h of list) renderHabitCard(plugin, sec, h, date);
  }
}

function renderFocus(plugin: IdentityTrackerPlugin, body: HTMLElement, date: string): void {
  const E = plugin.engine;
  const box = body.createDiv({ cls: "iht-focus" });
  const head = box.createDiv({ cls: "iht-focus-head" });
  head.createSpan({ cls: "iht-focus-title", text: "🎯 " + t("focusTitle") });
  head.createSpan({ cls: "iht-focus-hint", text: t("focusHint") });
  const chips = box.createDiv({ cls: "iht-chips" });
  const cur = E.focusOn(date);
  for (const i of plugin.data.identities) {
    const c = chips.createEl("button", { cls: "iht-chip" + (cur === i.id ? " is-active" : ""), text: i.icon + " " + loc(i.name, i.nameAr) });
    c.setAttr("aria-pressed", String(cur === i.id));
    c.addEventListener("click", () => plugin.setFocus(date, cur === i.id ? "" : i.id));
  }
}

const STATUS_KEY: Record<Status, I18nKey> = {
  done: "statusDone", micro: "statusMicro", rest: "statusRest", missed: "statusMissed", pending: "statusPending", na: "statusNa",
};

export function renderHabitCard(plugin: IdentityTrackerPlugin, parent: HTMLElement, h: TrackedHabit, date: string, compact = false): void {
  const E = plugin.engine;
  const s = E.status(h, date);
  const critical = E.isCritical(h, date);
  const adaptive = E.needsMicro(h, date);
  const card = parent.createDiv({ cls: "iht-habit is-" + s + (critical ? " is-critical" : "") });
  const main = card.createDiv({ cls: "iht-habit-main" });
  main.createDiv({ cls: "iht-habit-icon", text: h.icon });
  const info = main.createDiv({ cls: "iht-habit-info" });
  const nameRow = info.createDiv({ cls: "iht-habit-name" });
  nameRow.createSpan({ text: loc(h.name, h.nameAr) });
  if (h.badge) nameRow.createSpan({ cls: "iht-src iht-src-" + h.badge.toLowerCase(), text: h.badge, attr: { "aria-label": h.badge === "RJ" ? t("sourceRj") : t("sourceHj") } });
  if (!compact) nameRow.addEventListener("click", () => new HabitModal(plugin, h).open());

  const c = E.consistency(h, date);
  const meta = info.createDiv({ cls: "iht-habit-meta" });
  meta.createSpan({ cls: "iht-pct", text: c.pct + "%", attr: { "aria-label": t("consistency30") + ": " + c.hits + "/" + c.den } });
  meta.createSpan({ text: "🔥 " + E.streak(h, date), attr: { "aria-label": t("streak") } });
  meta.createSpan({ text: "×" + fmt1(h.weight * E.multiplier(h, date)), attr: { "aria-label": t("weightLabel") } });
  const gained = E.xp(h, date);
  if (gained) meta.createSpan({ cls: "iht-gain", text: "+" + fmt1(gained) + " " + t("xp") });
  const prog = h.progress?.(date);
  if (prog) meta.createSpan({ cls: "iht-progress", text: prog, attr: { "aria-label": h.externalPartial(date) ? t("partialProgress") : "" } });
  if (s !== "pending") meta.createSpan({ cls: "iht-state-label", text: t(STATUS_KEY[s]) });

  const acts = main.createDiv({ cls: "iht-actions" });
  const act = (m: Mark, emoji: string, tip: string) => {
    const active = s === m;
    const b = acts.createEl("button", { cls: "iht-act iht-act-" + m + (active ? " is-active" : ""), text: emoji });
    b.setAttr("aria-label", h.auto && m === "done" ? t("autoHabitNoManual", { src: h.badge === "RJ" ? t("sourceRj") : t("sourceHj") }) : tip);
    b.setAttr("aria-pressed", String(active));
    b.addEventListener("click", e => { e.stopPropagation(); void plugin.applyMark(h, date, active ? "clear" : m); });
  };
  act("done", "✅", t("actDone"));
  act("micro", "⚡", t("actMicro") + (h.micro ? ": " + loc(h.micro, h.microAr) : ""));
  act("rest", "❄️", t("actRest"));

  if (critical) {
    const cb = card.createDiv({ cls: "iht-critical" });
    cb.createSpan({ cls: "iht-critical-badge", text: "⚠️ " + t("criticalDay") });
    if (!compact) cb.createSpan({ cls: "iht-critical-hint", text: t("criticalHint") });
  }
  if (adaptive && !compact) {
    const ab = card.createDiv({ cls: "iht-adaptive" });
    ab.createDiv({ cls: "iht-adaptive-title", text: "🧩 " + t("adaptiveTitle") });
    ab.createDiv({ cls: "iht-adaptive-text", text: t("adaptiveBody", { n: adaptive }) + " " + (loc(h.micro, h.microAr) || t("microFallback")) });
    button(ab, { text: "⚡ " + t("completeMicro"), cls: "mod-cta", onClick: () => plugin.applyMark(h, date, "micro") });
  }
}

// ---------------------------------------------------------------- identities
export function renderIdentityCards(plugin: IdentityTrackerPlugin, body: HTMLElement, date: string): void {
  const E = plugin.engine;
  const all = E.allTimeTotals(date);
  const week = E.identityTotals(addDays(date, -6), date);
  const grid = body.createDiv({ cls: "iht-id-grid" });
  for (const i of E.identities) {
    const xp = all[i.id] || 0;
    const lv = levelOf(xp);
    const card = grid.createDiv({ cls: "iht-id-card iht-lv" + lv.level });
    card.addEventListener("click", () => new IdentityModal(plugin, i).open());
    const top = card.createDiv({ cls: "iht-id-top" });
    top.createDiv({ cls: "iht-id-icon", text: i.icon });
    const nm = top.createDiv({ cls: "iht-id-names" });
    nm.createDiv({ cls: "iht-id-name", text: loc(i.name, i.nameAr) });
    nm.createDiv({ cls: "iht-id-level", text: lv.emoji + " " + t("level") + " " + lv.level + " · " + t(lv.key as I18nKey) });
    top.createDiv({ cls: "iht-id-xp", text: fmt1(xp) + " " + t("pts") });
    const pct = lv.next ? ((xp - lv.min) / (lv.next - lv.min)) * 100 : 100;
    bar(card, pct, "is-level");
    const foot = card.createDiv({ cls: "iht-id-foot" });
    if (lv.next) {
      const nextLv = levelOf(lv.next);
      foot.createSpan({ text: t("nextLevelIn", { n: fmt1(lv.next - xp), title: nextLv.emoji + " " + t(nextLv.key as I18nKey) }) });
    } else foot.createSpan({ text: t("maxLevel") });
    foot.createSpan({ cls: "iht-id-week", text: "+" + fmt1(week[i.id] || 0) + " / 7" + t("dayUnit") });
  }
}

function comparison(parent: HTMLElement, title: string, plugin: IdentityTrackerPlugin, totals: Record<string, number>): void {
  const box = parent.createDiv({ cls: "iht-card" });
  box.createDiv({ cls: "iht-card-title", text: title });
  const ids = plugin.data.identities;
  const max = Math.max(1, ...ids.map(i => totals[i.id] || 0));
  for (const i of [...ids].sort((a, b) => (totals[b.id] || 0) - (totals[a.id] || 0))) {
    const row = box.createDiv({ cls: "iht-cmp-row" });
    row.createDiv({ cls: "iht-cmp-label", text: i.icon + " " + loc(i.name, i.nameAr) });
    bar(row, ((totals[i.id] || 0) / max) * 100);
    row.createDiv({ cls: "iht-cmp-value", text: fmt1(totals[i.id] || 0) });
  }
}

function renderIdentities(plugin: IdentityTrackerPlugin, body: HTMLElement, date: string): void {
  const E = plugin.engine;
  renderIdentityCards(plugin, body, date);
  comparison(body, t("weeklyVotes"), plugin, E.identityTotals(addDays(date, -6), date));
  comparison(body, t("allTimeVotes"), plugin, E.allTimeTotals(date));
  button(body, { text: t("addIdentity"), icon: "user-plus", cls: "iht-wide", onClick: () => new IdentityModal(plugin, null).open() });
}

// ---------------------------------------------------------------- analytics
export function renderHeatmap(plugin: IdentityTrackerPlugin, parent: HTMLElement, end: string, interactive = true): void {
  const E = plugin.engine;
  const days = plugin.data.settings.heatmapDays;
  const box = parent.createDiv({ cls: "iht-card iht-heat-card" });
  const head = box.createDiv({ cls: "iht-card-head" });
  head.createDiv({ cls: "iht-card-title", text: t("heatmap") });
  if (interactive) {
    const sw = head.createDiv({ cls: "iht-seg" });
    for (const n of [90, 365] as const) {
      const b = sw.createEl("button", { cls: "iht-seg-opt" + (days === n ? " is-active" : ""), text: t("heatmapRange", { n }) });
      b.addEventListener("click", () => { plugin.data.settings.heatmapDays = n; plugin.saveSoon(); plugin.refresh(); });
    }
  }
  let start = addDays(end, -(days - 1));
  start = addDays(start, -weekday(start)); // align to Sunday
  const keys = range(start, end);
  const xps = keys.map(k => E.dayXp(k));
  const max = Math.max(1, ...xps);
  const weeks = Math.ceil(keys.length / 7);
  const grid = box.createDiv({ cls: "iht-heat" });
  grid.style.gridTemplateColumns = "repeat(" + weeks + ", 1fr)";
  const first = addDays(end, -(days - 1));
  keys.forEach((k, idx) => {
    const cell = grid.createDiv({ cls: "iht-heat-cell" });
    if (k < first) { cell.addClass("is-out"); return; }
    const x = xps[idx];
    const lvl = x <= 0 ? 0 : x <= max * 0.25 ? 1 : x <= max * 0.5 ? 2 : x <= max * 0.75 ? 3 : 4;
    cell.addClass("l" + lvl);
    const c = E.dayCounts(k);
    if (c.rest) cell.addClass("is-rest");
    if (k === end) cell.addClass("is-end");
    cell.setAttr("aria-label", t("heatTip", { date: niceDate(k), xp: fmt1(x), done: c.done, total: c.total }) + (c.rest ? t("heatTipRest") : ""));
    if (interactive) cell.addEventListener("click", () => { plugin.ui.date = k; plugin.data.ui.tab = "today"; plugin.refresh(); });
  });
  const legend = box.createDiv({ cls: "iht-legend" });
  legend.createSpan({ text: t("less") });
  for (let l = 0; l <= 4; l++) legend.createDiv({ cls: "iht-heat-cell l" + l });
  legend.createSpan({ text: t("more") });
  legend.createDiv({ cls: "iht-heat-cell is-rest l0" });
  legend.createSpan({ text: "❄️" });
}

export function renderInsights(plugin: IdentityTrackerPlugin, parent: HTMLElement, date: string): void {
  const box = parent.createDiv({ cls: "iht-card iht-insights" });
  box.createDiv({ cls: "iht-card-title", text: "🧠 " + t("insights") });
  const list = detectPatterns(plugin.engine, date);
  if (!list.length) { box.createDiv({ cls: "iht-muted", text: t("insightsEmpty") }); return; }
  const icons = { friction: "🧗", correlation: "🔗", identity: "🪪", info: "💡" } as const;
  for (const i of list) {
    const row = box.createDiv({ cls: "iht-insight is-" + i.kind });
    row.createSpan({ cls: "iht-insight-icon", text: icons[i.kind] });
    row.createSpan({ text: i.text });
  }
}

function renderLoad(plugin: IdentityTrackerPlugin, parent: HTMLElement, date: string): void {
  const E = plugin.engine;
  const box = parent.createDiv({ cls: "iht-card" });
  box.createDiv({ cls: "iht-card-title", text: "🔋 " + t("loadTitle") });
  const days = range(addDays(date, -6), date);
  const loads = days.map(d => E.dayLoad(d));
  const max = Math.max(1, ...loads);
  const chart = box.createDiv({ cls: "iht-load" });
  days.forEach((d, i) => {
    const col = chart.createDiv({ cls: "iht-load-col" });
    col.createDiv({ cls: "iht-load-val", text: fmt1(loads[i]) });
    const b = col.createDiv({ cls: "iht-load-bar" });
    b.style.height = Math.max(4, (loads[i] / max) * 100) + "%";
    if (E.heavyRun(d) >= 6) b.addClass("is-hot");
    col.createDiv({ cls: "iht-load-day", text: niceDate(d).split(/[ ,،]+/)[0] });
  });
}

function renderHabitTable(plugin: IdentityTrackerPlugin, parent: HTMLElement, date: string): void {
  const E = plugin.engine;
  const box = parent.createDiv({ cls: "iht-card" });
  box.createDiv({ cls: "iht-card-title", text: "📈 " + t("habitTable") });
  const hs = E.habits().filter(h => h.applicable(date) || E.consistency(h, date).den > 0)
    .map(h => ({ h, c: E.consistency(h, date), s: E.streak(h, date) }))
    .sort((a, b) => b.c.pct - a.c.pct);
  for (const { h, c, s } of hs) {
    const row = box.createDiv({ cls: "iht-tbl-row" });
    row.createDiv({ cls: "iht-tbl-name", text: h.icon + " " + loc(h.name, h.nameAr) });
    bar(row, c.pct, c.pct >= 80 ? "is-good" : c.pct >= 50 ? "is-mid" : "is-low");
    row.createDiv({ cls: "iht-tbl-val", text: c.pct + "% · " + c.hits + "/" + c.den });
    row.createDiv({ cls: "iht-tbl-streak", text: "🔥" + s });
  }
}

function renderAnalytics(plugin: IdentityTrackerPlugin, body: HTMLElement, date: string): void {
  renderHeatmap(plugin, body, date);
  renderInsights(plugin, body, date);
  renderLoad(plugin, body, date);
  renderHabitTable(plugin, body, date);
  button(body, { text: t("exportReport"), icon: "file-down", cls: "iht-wide mod-cta", onClick: () => exportReport(plugin, monthKey(date)) });
}

// ---------------------------------------------------------------- code block
/**
 * ```identity-tracker
 * cards heatmap        ← any of: cards | heatmap | today | insights | summary
 * ```
 */
export function renderBlock(plugin: IdentityTrackerPlugin, el: HTMLElement, src: string): void {
  prepareRoot(el);
  el.addClass("iht-block");
  const words = src.toLowerCase().split(/[\s,]+/).filter(Boolean);
  const want = words.length ? words : ["cards", "heatmap"];
  const date = todayKey();
  const E = plugin.engine;
  for (const w of want) {
    if (w === "cards" || w === "identities") renderIdentityCards(plugin, el, date);
    else if (w === "heatmap") renderHeatmap(plugin, el, date, false);
    else if (w === "insights") renderInsights(plugin, el, date);
    else if (w === "today" || w === "habits") {
      const box = el.createDiv({ cls: "iht-card" });
      box.createDiv({ cls: "iht-card-title", text: t("tabToday") });
      for (const h of E.habitsOn(date)) renderHabitCard(plugin, box, h, date, true);
    } else if (w === "summary") {
      const box = el.createDiv({ cls: "iht-stats" });
      const s = (v: string, l: string) => { const d = box.createDiv({ cls: "iht-stat" }); d.createDiv({ cls: "iht-stat-value", text: v }); d.createDiv({ cls: "iht-stat-label", text: l }); };
      s("⚡ " + fmt1(E.dayXp(date)), t("todayXp"));
      s(E.overallConsistency(date).pct + "%", t("consistency30"));
      s("❄️ " + E.freezeLeft(monthKey(date)), t("freezeLeft"));
    }
  }
}

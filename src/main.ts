import { MarkdownRenderChild, Notice, Plugin, type WorkspaceLeaf } from "obsidian";
import { type Mark, type TrackedHabit, type TrackerData } from "./types";
import { setLang, t, loc } from "./i18n";
import type { I18nKey } from "./i18n";
import { Bridge, HJ_ID } from "./integrations/bridge";
import { Engine, levelOf } from "./core/engine";
import { monthKey, todayKey } from "./core/dates";
import { mapGroups, normalize, SEED_IDENTITIES, seedNativeHabits } from "./storage/store";
import { SyncEngine } from "./storage/syncEngine";
import { exportReport } from "./reports/reportGenerator";
import { IdentitySidebarView, renderBlock, VIEW_TYPE } from "./ui/SidebarView";
import { HabitSuggestModal, IdentitySuggestModal } from "./ui/Modals";
import { IdentitySettingTab } from "./ui/SettingsTab";

export interface Renderable { render(): void }

export interface ApplyOptions { fromYaml?: boolean; quiet?: boolean }

export default class IdentityTrackerPlugin extends Plugin {
  data!: TrackerData;
  bridge!: Bridge;
  engine!: Engine;
  sync!: SyncEngine;
  renderers = new Set<Renderable>();
  ui = { date: todayKey(), lastToday: todayKey() };
  private statusEl: HTMLElement | null = null;
  private saveTimer: number | null = null;
  private extTimer: number | null = null;
  private settingTab: IdentitySettingTab | null = null;

  async onload(): Promise<void> {
    this.data = normalize(await this.loadData());
    setLang(this.data.lang);

    const hook: Renderable = { render: () => this.onExternalChange() };
    this.bridge = new Bridge(this.app, hook, () => ({ hj: this.data.settings.useHabitJourney, rj: this.data.settings.useReadingJourney }));
    this.engine = new Engine(() => this.data, this.bridge);
    this.sync = new SyncEngine(this);

    this.registerView(VIEW_TYPE, (leaf: WorkspaceLeaf) => new IdentitySidebarView(leaf, this));
    this.addRibbonIcon("target", t("appTitle"), () => this.activateView());
    this.settingTab = new IdentitySettingTab(this.app, this);
    this.addSettingTab(this.settingTab);
    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass("iht-statusbar");
    this.statusEl.addEventListener("click", () => this.activateView());

    this.registerCommands();

    this.registerMarkdownCodeBlockProcessor("identity-tracker", (src, el, ctx) => {
      const child = new BlockChild(el, this, src);
      ctx.addChild(child);
    });

    this.registerEvent(this.app.metadataCache.on("changed", (file, _data, cache) => { void this.sync.onMetadataChanged(file, cache); }));
    // day rollover while Obsidian stays open
    this.registerInterval(window.setInterval(() => {
      const k = todayKey();
      if (k !== this.ui.lastToday) { if (this.ui.date === this.ui.lastToday) this.ui.date = k; this.ui.lastToday = k; this.refresh(); }
    }, 60000));

    this.app.workspace.onLayoutReady(async () => {
      await this.seed();
      this.refresh();
    });
  }

  onunload(): void {
    this.bridge.detachAll();
    if (this.saveTimer) window.clearTimeout(this.saveTimer);
    if (this.extTimer) window.clearTimeout(this.extTimer);
    void this.saveData(this.data);
  }

  // ---------------------------------------------------------------- persistence
  async save(): Promise<void> {
    if (this.saveTimer) { window.clearTimeout(this.saveTimer); this.saveTimer = null; }
    await this.saveData(this.data);
  }

  saveSoon(): void {
    if (this.saveTimer) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => { this.saveTimer = null; void this.saveData(this.data); }, 400);
  }

  private async seed(): Promise<void> {
    const D = this.data;
    const hj = this.bridge.hj();
    const groups = hj ? [...new Set(hj.settings.habits.map(h => h.group || "").filter(Boolean))] : [];
    let changed = false;
    if (!D.seeded) {
      D.identities = SEED_IDENTITIES.map(i => ({ ...i, groups: [...i.groups] }));
      if (hj) { mapGroups(D, groups); D.hjSeeded = true; }
      else D.habits = seedNativeHabits();
      D.seeded = true;
      changed = true;
    } else if (!D.hjSeeded && hj) {
      mapGroups(D, groups);
      D.hjSeeded = true;
      changed = true;
    }
    if (changed) await this.save();
  }

  // ---------------------------------------------------------------- rendering
  refresh(): void {
    this.engine.invalidate();
    for (const r of this.renderers) {
      try { r.render(); } catch (e) { console.error("Identity Tracker render error", e); }
    }
    this.updateStatusBar();
  }

  /** Habit Journey / Reading Journey refreshed — re-render and mirror today's state into the daily note. */
  private onExternalChange(): void {
    if (this.extTimer) window.clearTimeout(this.extTimer);
    this.extTimer = window.setTimeout(() => {
      this.extTimer = null;
      this.refresh();
      void this.sync.writeDate(todayKey(), false);
      if (this.ui.date !== todayKey()) void this.sync.writeDate(this.ui.date, false);
    }, 300);
  }

  updateStatusBar(): void {
    if (!this.statusEl) return;
    this.statusEl.toggle(this.data.settings.showStatusBar);
    if (!this.data.settings.showStatusBar) return;
    const k = todayKey();
    const pct = this.engine.overallConsistency(k).pct;
    const xp = Math.round(this.engine.dayXp(k) * 10) / 10;
    this.statusEl.setText(t("statusBar", { pct, xp }));
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      const right = workspace.getRightLeaf(false);
      if (!right) return;
      leaf = right;
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    await workspace.revealLeaf(leaf);
  }

  async toggleLang(): Promise<void> {
    this.data.lang = this.data.lang === "en" ? "ar" : "en";
    setLang(this.data.lang);
    await this.save();
    this.refresh();
    this.settingTab?.redraw();
  }

  // ---------------------------------------------------------------- mutations
  private levels(): Record<string, number> {
    const totals = this.engine.allTimeTotals();
    const out: Record<string, number> = {};
    for (const i of this.data.identities) out[i.id] = levelOf(totals[i.id] || 0).level;
    return out;
  }

  private setLocal(uid: string, date: string, m: Mark | null): void {
    const L = this.data.log;
    if (m) (L[date] || (L[date] = {}))[uid] = m;
    else if (L[date]) { delete L[date][uid]; if (!Object.keys(L[date]).length) delete L[date]; }
  }

  /**
   * Single entry point for changing a habit's state on a day.
   * Full completions of Habit Journey habits are written to Habit Journey; micro / rest live here.
   */
  async applyMark(h: TrackedHabit, date: string, to: Mark | "clear", opts: ApplyOptions = {}): Promise<boolean> {
    const E = this.engine;
    if (to === "rest" && !E.canFreeze(date)) {
      if (!opts.quiet) new Notice(t("noFreezeLeft", { used: E.freezeDates(monthKey(date)).size, max: this.data.settings.freezePerMonth }));
      return false;
    }
    const before = this.levels();
    const freezeBefore = E.freezeDates(monthKey(date)).size;
    const hjHabit = h.source === "habit-journey" ? this.bridge.hj()?.settings.habits.find(x => x.id === h.sourceId) : undefined;

    if (hjHabit) {
      if (to === "done") {
        if (this.bridge.hjSetDone(hjHabit, date, true)) this.setLocal(h.uid, date, null);
        else this.setLocal(h.uid, date, "done");
      } else if (to === "micro" || to === "rest") {
        this.setLocal(h.uid, date, to);
        if (!h.auto && h.externalDone(date)) this.bridge.hjSetDone(hjHabit, date, false);
      } else {
        this.setLocal(h.uid, date, null);
        if (!h.auto && h.externalDone(date)) this.bridge.hjSetDone(hjHabit, date, false);
      }
    } else {
      this.setLocal(h.uid, date, to === "clear" ? null : to);
    }

    this.saveSoon();
    this.refresh();
    if (!opts.fromYaml) void this.sync.writeDate(date, true);

    if (!opts.quiet) {
      if (to === "done") new Notice(t("logged", { name: loc(h.name, h.nameAr), xp: E.fullXp(h, date) }));
      else if (to === "micro") new Notice(t("loggedMicro", { name: loc(h.name, h.nameAr), xp: E.fullXp(h, date, true) }));
      const used = E.freezeDates(monthKey(date)).size;
      if (to === "rest" && used > freezeBefore) new Notice(t("freezeUsed", { used, max: this.data.settings.freezePerMonth }));
    }
    this.announceLevelUps(before);
    return true;
  }

  private announceLevelUps(before: Record<string, number>): void {
    const after = this.levels();
    const totals = this.engine.allTimeTotals();
    for (const i of this.data.identities) {
      if ((after[i.id] || 1) > (before[i.id] || 1)) {
        const lv = levelOf(totals[i.id] || 0);
        new Notice(t("levelUp", { identity: loc(i.name, i.nameAr), title: t(lv.key as I18nKey), emoji: lv.emoji }), 6000);
      }
    }
  }

  async toggleDayFreeze(date: string): Promise<void> {
    const D = this.data;
    if (D.dayFreeze[date]) delete D.dayFreeze[date];
    else {
      if (!this.engine.canFreeze(date)) {
        new Notice(t("noFreezeLeft", { used: this.engine.freezeDates(monthKey(date)).size, max: D.settings.freezePerMonth }));
        return;
      }
      D.dayFreeze[date] = true;
      this.engine.invalidate();
      new Notice(t("freezeUsed", { used: this.engine.freezeDates(monthKey(date)).size, max: D.settings.freezePerMonth }));
    }
    await this.save();
    this.refresh();
    void this.sync.writeDate(date, true);
  }

  async setFocus(date: string, identityId: string): Promise<void> {
    const before = this.levels();
    if (identityId) this.data.focus[date] = identityId; else delete this.data.focus[date];
    await this.save();
    this.refresh();
    const i = this.engine.identity(identityId);
    new Notice(i ? t("focusSet", { name: loc(i.name, i.nameAr) }) : t("focusCleared"));
    this.announceLevelUps(before);
    void this.sync.writeDate(date, true);
  }

  // ---------------------------------------------------------------- commands
  private registerCommands(): void {
    this.addCommand({ id: "open-dashboard", name: t("cmdOpen"), callback: () => this.activateView() });
    this.addCommand({ id: "toggle-language", name: t("cmdLang"), callback: () => this.toggleLang() });
    this.addCommand({ id: "export-monthly-report", name: t("cmdReport"), callback: () => exportReport(this) });
    this.addCommand({
      id: "quick-log-habit", name: t("cmdQuick"),
      callback: () => new HabitSuggestModal(this, todayKey(), false).open(),
    });
    this.addCommand({
      id: "quick-log-micro", name: t("cmdQuickMicro"),
      callback: () => new HabitSuggestModal(this, todayKey(), true).open(),
    });
    this.addCommand({ id: "toggle-freeze-today", name: t("cmdFreeze"), callback: () => this.toggleDayFreeze(todayKey()) });
    this.addCommand({ id: "set-focus-identity", name: t("cmdFocus"), callback: () => new IdentitySuggestModal(this, todayKey()).open() });
    this.addCommand({
      id: "sync-daily-note", name: t("cmdSync"),
      callback: async () => {
        const ok = await this.sync.writeDate(todayKey(), true);
        new Notice(ok ? t("synced") : t("noDailyNote", { date: todayKey() }));
      },
    });
  }

  openHabitJourneyManager(): void {
    const cmds = (this.app as unknown as { commands?: { executeCommandById(id: string): boolean } }).commands;
    cmds?.executeCommandById(HJ_ID + ":manage-habits");
  }

  openSettings(): void {
    const setting = (this.app as unknown as { setting?: { open(): void; openTabById(id: string): void } }).setting;
    if (!setting) return;
    setting.open();
    setting.openTabById(this.manifest.id);
  }

  /** After a CRUD edit: re-render views and the settings list. */
  afterEdit(): void {
    this.refresh();
    this.settingTab?.redraw();
  }
}

class BlockChild extends MarkdownRenderChild {
  constructor(el: HTMLElement, private plugin: IdentityTrackerPlugin, private src: string) { super(el); }
  onload(): void { this.plugin.renderers.add(this); this.render(); }
  onunload(): void { this.plugin.renderers.delete(this); }
  render(): void { renderBlock(this.plugin, this.containerEl, this.src); }
}

/**
 * Daily-note frontmatter sync (second half of the dual-storage architecture).
 * data.json (and Habit Journey) stay authoritative for rendering; daily notes mirror each
 * habit as a YAML property so the vault keeps native ownership of the record (Dataview etc.).
 */
import { moment, normalizePath, TFile, type CachedMetadata } from "obsidian";
import type IdentityTrackerPlugin from "../main";
import type { Status, TrackedHabit } from "../types";
import { parseYaml, type YamlMark } from "./yaml";

const XP_KEY = "identity_xp";
const FOCUS_KEY = "identity_focus";
const GUARD_MS = 1500;

const toYaml = (s: Status): boolean | string => (s === "done" ? true : s === "micro" ? "micro" : s === "rest" ? "rest" : false);
const statusAsMark = (s: Status): YamlMark => (s === "done" || s === "micro" || s === "rest" ? s : "none");

export class SyncEngine {
  private writing = new Map<string, number>();

  constructor(private plugin: IdentityTrackerPlugin) {}

  folder(): string {
    const s = this.plugin.data.settings.dailyFolder.trim();
    if (s) return normalizePath(s).replace(/^\/+|\/+$/g, "");
    const rj = this.plugin.bridge.rj();
    const rjFolder = rj?.settings.dailyNoteFolder;
    if (rjFolder && String(rjFolder).trim()) return String(rjFolder).replace(/^\/+|\/+$/g, "");
    return (this.plugin.bridge.coreDailyNotes()?.folder || "").replace(/^\/+|\/+$/g, "");
  }

  format(): string {
    return this.plugin.data.settings.dateFormat.trim() || this.plugin.bridge.coreDailyNotes()?.format || "YYYY-MM-DD";
  }

  pathFor(date: string): string {
    const name = moment(date, "YYYY-MM-DD").format(this.format()) + ".md";
    const f = this.folder();
    return normalizePath(f ? f + "/" + name : name);
  }

  /** Like Habit Journey, any note named after a date counts as that day's note (folder is only used for creating). */
  dateOfFile(file: TFile): string | null {
    if (file.extension !== "md") return null;
    const m = moment(file.basename, this.format(), true);
    return m.isValid() ? m.format("YYYY-MM-DD") : null;
  }

  async findNote(date: string): Promise<TFile | null> {
    const direct = this.plugin.app.vault.getAbstractFileByPath(this.pathFor(date));
    if (direct instanceof TFile) return direct;
    return this.plugin.bridge.findDailyNote(date);
  }

  private async ensureFolder(path: string): Promise<void> {
    if (!path) return;
    const parts = path.split("/");
    let cur = "";
    for (const p of parts) {
      cur = cur ? cur + "/" + p : p;
      if (!this.plugin.app.vault.getAbstractFileByPath(cur)) {
        try { await this.plugin.app.vault.createFolder(cur); } catch { /* created concurrently */ }
      }
    }
  }

  async ensureNote(date: string): Promise<TFile | null> {
    const found = await this.findNote(date);
    if (found) return found;
    if (!this.plugin.data.settings.autoCreateDailyNote) return null;
    await this.ensureFolder(this.folder());
    try {
      return await this.plugin.app.vault.create(this.pathFor(date), "# " + date + "\n");
    } catch {
      const again = this.plugin.app.vault.getAbstractFileByPath(this.pathFor(date));
      return again instanceof TFile ? again : null;
    }
  }

  private desired(date: string): Record<string, boolean | string | number> {
    const E = this.plugin.engine;
    const out: Record<string, boolean | string | number> = {};
    for (const h of E.habitsOn(date)) out[h.yamlKey] = toYaml(E.status(h, date));
    out[XP_KEY] = Math.round(E.dayXp(date) * 10) / 10;
    const focus = E.identity(E.focusOn(date));
    if (focus) out[FOCUS_KEY] = focus.name;
    return out;
  }

  /**
   * Mirror a day's statuses into its daily note. `create` = may create the note (explicit user action).
   * Returns false when no note exists and none was created.
   */
  async writeDate(date: string, create: boolean): Promise<boolean> {
    if (!this.plugin.data.settings.syncFrontmatter) return true;
    const file = create ? await this.ensureNote(date) : await this.findNote(date);
    if (!file) return false;
    const want = this.desired(date);
    const fm = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter || {};
    const focusName = want[FOCUS_KEY];
    const same = Object.keys(want).every(k => fm[k] === want[k]) && (focusName !== undefined || fm[FOCUS_KEY] === undefined);
    if (same) return true;
    this.writing.set(file.path, Date.now());
    try {
      await this.plugin.app.fileManager.processFrontMatter(file, (front: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(want)) front[k] = v;
        if (focusName === undefined) delete front[FOCUS_KEY];
      });
    } catch (e) {
      console.warn("Identity Tracker: could not update frontmatter of " + file.path, e);
      return false;
    } finally {
      this.writing.set(file.path, Date.now());
    }
    return true;
  }

  /** Manual YAML edits in a daily note flow back into the tracker (and Habit Journey). */
  async onMetadataChanged(file: TFile, cache: CachedMetadata): Promise<void> {
    if (!this.plugin.data.settings.syncFrontmatter) return;
    const w = this.writing.get(file.path);
    if (w && Date.now() - w < GUARD_MS) return;
    this.writing.delete(file.path);
    const date = this.dateOfFile(file);
    if (!date) return;
    const fm = cache.frontmatter;
    if (!fm) return;
    const E = this.plugin.engine;
    const changes: { h: TrackedHabit; to: YamlMark }[] = [];
    for (const h of E.habitsOn(date)) {
      const to = parseYaml(fm[h.yamlKey]);
      if (!to) continue;
      if (statusAsMark(E.status(h, date)) !== to) changes.push({ h, to });
    }
    if (!changes.length) return;
    for (const c of changes) await this.plugin.applyMark(c.h, date, c.to === "none" ? "clear" : c.to, { fromYaml: true, quiet: true });
  }
}

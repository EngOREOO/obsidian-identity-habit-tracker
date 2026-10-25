import { FuzzySuggestModal, Modal, Notice, Setting } from "obsidian";
import type IdentityTrackerPlugin from "../main";
import type { Identity, TrackedHabit } from "../types";
import { dir, loc, t } from "../i18n";
import { slugKey } from "../core/engine";
import { todayKey } from "../core/dates";
import { uid } from "../storage/store";

function prepare(modal: Modal, title: string): HTMLElement {
  modal.modalEl.addClass("iht-modal");
  modal.modalEl.setAttr("dir", dir());
  modal.titleEl.setText(title);
  modal.contentEl.empty();
  return modal.contentEl;
}

// ---------------------------------------------------------------- confirm
export class ConfirmModal extends Modal {
  constructor(plugin: IdentityTrackerPlugin, private message: string, private onYes: () => void | Promise<void>) { super(plugin.app); }
  onOpen(): void {
    const el = prepare(this, t("confirm"));
    el.createEl("p", { text: this.message });
    new Setting(el)
      .addButton(b => b.setButtonText(t("cancel")).onClick(() => this.close()))
      .addButton(b => b.setButtonText(t("confirm")).setWarning().onClick(async () => { this.close(); await this.onYes(); }));
  }
  onClose(): void { this.contentEl.empty(); }
}

// ---------------------------------------------------------------- identity
export class IdentityModal extends Modal {
  private v: Identity;
  constructor(private plugin: IdentityTrackerPlugin, private existing: Identity | null) {
    super(plugin.app);
    this.v = existing ? { ...existing, groups: [...existing.groups] } : { id: uid("id"), name: "", nameAr: "", icon: "✨", groups: [] };
  }

  onOpen(): void {
    const el = prepare(this, this.existing ? t("identityModalEdit") : t("identityModalNew"));
    new Setting(el).setName(t("fName")).addText(c => c.setValue(this.v.name).onChange(x => (this.v.name = x)));
    new Setting(el).setName(t("fNameAr")).addText(c => { c.setValue(this.v.nameAr || "").onChange(x => (this.v.nameAr = x)); c.inputEl.setAttr("dir", "rtl"); });
    new Setting(el).setName(t("fIcon")).addText(c => c.setValue(this.v.icon).onChange(x => (this.v.icon = x)));
    if (this.plugin.bridge.hj()) {
      new Setting(el).setName(t("fGroups")).setDesc(t("fGroupsDesc"))
        .addText(c => c.setValue(this.v.groups.join(", ")).onChange(x => (this.v.groups = x.split(",").map(s => s.trim()).filter(Boolean))));
    }
    const row = new Setting(el);
    if (this.existing) row.addButton(b => b.setButtonText(t("delete")).setWarning().onClick(() => {
      new ConfirmModal(this.plugin, t("confirmDeleteIdentity", { name: loc(this.v.name, this.v.nameAr) }), async () => {
        const D = this.plugin.data;
        D.identities = D.identities.filter(i => i.id !== this.v.id);
        for (const h of D.habits) if (h.identityId === this.v.id) h.identityId = "";
        for (const m of Object.values(D.meta)) if (m.identityId === this.v.id) m.identityId = "";
        for (const d of Object.keys(D.focus)) if (D.focus[d] === this.v.id) delete D.focus[d];
        await this.plugin.save();
        this.plugin.afterEdit();
        this.close();
      }).open();
    }));
    row.addButton(b => b.setButtonText(t("cancel")).onClick(() => this.close()));
    row.addButton(b => b.setButtonText(t("save")).setCta().onClick(() => this.submit()));
  }

  private async submit(): Promise<void> {
    if (!this.v.name.trim() && !(this.v.nameAr || "").trim()) { new Notice(t("nameRequired")); return; }
    if (!this.v.name.trim()) this.v.name = this.v.nameAr || "";
    const D = this.plugin.data;
    const i = D.identities.findIndex(x => x.id === this.v.id);
    if (i >= 0) D.identities[i] = this.v; else D.identities.push(this.v);
    await this.plugin.save();
    this.plugin.afterEdit();
    this.close();
  }

  onClose(): void { this.contentEl.empty(); }
}

// ---------------------------------------------------------------- habit
interface HabitDraft {
  name: string; nameAr: string; icon: string; identityId: string; yamlKey: string;
  weight: number; micro: string; microAr: string; store: "hj" | "native";
}

export class HabitModal extends Modal {
  private v: HabitDraft;

  constructor(private plugin: IdentityTrackerPlugin, private existing: TrackedHabit | null, presetIdentity = "") {
    super(plugin.app);
    const h = existing;
    this.v = {
      name: h?.name || "", nameAr: h?.nameAr || "", icon: h?.icon && h.icon !== "•" ? h.icon : "", identityId: h ? h.identityId : presetIdentity || plugin.data.identities[0]?.id || "",
      yamlKey: h?.yamlKey || "", weight: h?.weight || 1, micro: h?.micro || "", microAr: h?.microAr || "",
      store: plugin.bridge.hj() ? "hj" : "native",
    };
  }

  onOpen(): void {
    const el = prepare(this, this.existing ? t("habitModalEdit") : t("habitModalNew"));
    const fromHj = this.existing?.source === "habit-journey";
    if (fromHj) {
      const info = el.createDiv({ cls: "iht-modal-info" });
      info.createSpan({ text: t("fromHj") + " " });
      const a = info.createEl("a", { text: t("openHj"), href: "#" });
      a.addEventListener("click", e => { e.preventDefault(); this.close(); this.plugin.openHabitJourneyManager(); });
    }
    if (!this.existing && this.plugin.bridge.hj()) {
      new Setting(el).setName(t("fStore")).addDropdown(d => d
        .addOption("hj", t("storeHj")).addOption("native", t("storeNative"))
        .setValue(this.v.store).onChange(x => (this.v.store = x as HabitDraft["store"])));
    }
    new Setting(el).setName(t("fName")).addText(c => c.setValue(this.v.name).onChange(x => (this.v.name = x)));
    new Setting(el).setName(t("fNameAr")).addText(c => { c.setValue(this.v.nameAr).onChange(x => (this.v.nameAr = x)); c.inputEl.setAttr("dir", "rtl"); });
    new Setting(el).setName(t("fIcon")).addText(c => c.setValue(this.v.icon).onChange(x => (this.v.icon = x)));
    new Setting(el).setName(t("fIdentity")).addDropdown(d => {
      d.addOption("", "— " + t("unassigned") + " —");
      for (const i of this.plugin.data.identities) d.addOption(i.id, i.icon + " " + loc(i.name, i.nameAr));
      d.setValue(this.v.identityId).onChange(x => (this.v.identityId = x));
    });
    new Setting(el).setName(t("fWeight")).addDropdown(d => {
      for (const w of [0.5, 1, 2, 3, 4, 5]) d.addOption(String(w), String(w));
      d.setValue(String(this.v.weight)).onChange(x => (this.v.weight = Number(x)));
    });
    new Setting(el).setName(t("fMicro")).addText(c => c.setValue(this.v.micro).onChange(x => (this.v.micro = x)));
    new Setting(el).setName(t("fMicroAr")).addText(c => { c.setValue(this.v.microAr).onChange(x => (this.v.microAr = x)); c.inputEl.setAttr("dir", "rtl"); });
    new Setting(el).setName(t("fYamlKey")).setDesc(t("fYamlKeyDesc"))
      .addText(c => c.setPlaceholder(slugKey(this.v.name || "habit")).setValue(this.v.yamlKey).onChange(x => (this.v.yamlKey = x.trim())));

    const row = new Setting(el);
    if (this.existing) row.addButton(b => b.setButtonText(t("delete")).setWarning().onClick(() => this.remove()));
    row.addButton(b => b.setButtonText(t("cancel")).onClick(() => this.close()));
    row.addButton(b => b.setButtonText(t("save")).setCta().onClick(() => this.submit()));
  }

  private uniqueKey(base: string, ownUid?: string): string {
    const taken = new Set(this.plugin.engine.habits().filter(h => h.uid !== ownUid).map(h => h.yamlKey));
    let k = slugKey(base), n = 2;
    while (taken.has(k)) k = slugKey(base) + "_" + n++;
    return k;
  }

  private async submit(): Promise<void> {
    const v = this.v, D = this.plugin.data, P = this.plugin;
    if (!v.name.trim() && !v.nameAr.trim()) { new Notice(t("nameRequired")); return; }
    const name = v.name.trim() || v.nameAr.trim();
    const ex = this.existing;
    const yamlKey = this.uniqueKey(v.yamlKey || name, ex?.uid);
    const metaFields = { identityId: v.identityId, nameAr: v.nameAr, yamlKey, weight: v.weight, micro: v.micro, microAr: v.microAr, icon: v.icon };

    if (ex && ex.source === "native") {
      const n = D.habits.find(x => x.id === ex.sourceId);
      if (n) Object.assign(n, metaFields, { name, icon: v.icon || "•" });
    } else if (ex && ex.source === "habit-journey") {
      D.meta[ex.uid] = metaFields;
      const hj = P.bridge.hj();
      const hjH = hj?.settings.habits.find(x => x.id === ex.sourceId);
      if (hj && hjH && hjH.name !== name) { hjH.name = name; hj.commit(); }
    } else if (v.store === "hj" && P.bridge.hj()) {
      const hj = P.bridge.hj();
      if (!hj) return;
      const identity = D.identities.find(i => i.id === v.identityId);
      let group = identity?.groups[0] || "";
      if (identity && !group) { group = identity.name; identity.groups.push(group); }
      hj.addHabit({ name, group: group || "General", type: "check", emoji: v.icon });
      const created = hj.settings.habits[hj.settings.habits.length - 1];
      if (created) D.meta["hj:" + created.id] = metaFields;
    } else {
      D.habits.push({ id: uid("h"), name, created: todayKey(), ...metaFields, icon: v.icon || "•" });
    }
    await P.save();
    P.afterEdit();
    this.close();
  }

  private remove(): void {
    const ex = this.existing;
    if (!ex) return;
    const P = this.plugin;
    if (ex.source === "habit-journey") {
      new ConfirmModal(P, t("confirmArchiveHj", { name: loc(ex.name, ex.nameAr) }), async () => {
        const hj = P.bridge.hj();
        const hjH = hj?.settings.habits.find(x => x.id === ex.sourceId);
        if (hj && hjH) { hjH.archivedAt = todayKey(); hj.commit(); }
        P.afterEdit();
        this.close();
      }).open();
    } else {
      new ConfirmModal(P, t("confirmDeleteHabit", { name: loc(ex.name, ex.nameAr) }), async () => {
        P.data.habits = P.data.habits.filter(h => h.id !== ex.sourceId);
        await P.save();
        P.afterEdit();
        this.close();
      }).open();
    }
  }

  onClose(): void { this.contentEl.empty(); }
}

// ---------------------------------------------------------------- command-palette pickers
export class HabitSuggestModal extends FuzzySuggestModal<TrackedHabit> {
  constructor(private plugin: IdentityTrackerPlugin, private date: string, private micro: boolean) {
    super(plugin.app);
    this.setPlaceholder(micro ? t("quickMicroPlaceholder") : t("quickLogPlaceholder"));
    this.modalEl.setAttr("dir", dir());
  }
  getItems(): TrackedHabit[] {
    const E = this.plugin.engine;
    return E.habitsOn(this.date).filter(h => { const s = E.status(h, this.date); return s !== "done" && (!this.micro || s !== "micro"); });
  }
  getItemText(h: TrackedHabit): string {
    const i = this.plugin.engine.identity(h.identityId);
    return h.icon + " " + loc(h.name, h.nameAr) + (i ? "  ·  " + loc(i.name, i.nameAr) : "");
  }
  onChooseItem(h: TrackedHabit): void {
    void this.plugin.applyMark(h, this.date, this.micro ? "micro" : "done");
  }
}

interface IdentityChoice { id: string; label: string }

export class IdentitySuggestModal extends FuzzySuggestModal<IdentityChoice> {
  constructor(private plugin: IdentityTrackerPlugin, private date: string) {
    super(plugin.app);
    this.setPlaceholder(t("focusPlaceholder"));
    this.modalEl.setAttr("dir", dir());
  }
  getItems(): IdentityChoice[] {
    return [{ id: "", label: t("focusNone") }, ...this.plugin.data.identities.map(i => ({ id: i.id, label: i.icon + " " + loc(i.name, i.nameAr) }))];
  }
  getItemText(c: IdentityChoice): string { return c.label; }
  onChooseItem(c: IdentityChoice): void { void this.plugin.setFocus(this.date, c.id); }
}

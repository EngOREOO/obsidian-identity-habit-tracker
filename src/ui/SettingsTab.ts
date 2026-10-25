import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type IdentityTrackerPlugin from "../main";
import { dir, getLang, loc, t } from "../i18n";
import { mapGroups } from "../storage/store";
import { exportReport, previousMonth } from "../reports/reportGenerator";
import { ConfirmModal, HabitModal, IdentityModal } from "./Modals";

export class IdentitySettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: IdentityTrackerPlugin) { super(app, plugin); }

  redraw(): void {
    if (this.containerEl.isShown()) this.display();
  }

  display(): void {
    const P = this.plugin, S = P.data.settings;
    const el = this.containerEl;
    el.empty();
    el.addClass("iht-settings");
    el.setAttr("dir", dir());
    const save = async () => { await P.save(); P.refresh(); };

    el.createEl("h2", { text: t("appTitle") });

    new Setting(el).setName(t("sLanguage")).setDesc(t("sLanguageDesc")).addButton(b => b
      .setButtonText(getLang() === "en" ? "EN ✓ | عربي" : "EN | عربي ✓")
      .onClick(async () => { await P.toggleLang(); this.display(); }));

    // ---- integrations
    new Setting(el).setName(t("sIntegrations")).setHeading();
    const hjOk = !!P.bridge.hj(), rjOk = !!P.bridge.rj();
    new Setting(el).setName(t("sHj")).setDesc(t("sHjDesc") + " — " + (hjOk ? t("sDetected") : t("sNotDetected")))
      .addToggle(c => c.setValue(S.useHabitJourney).onChange(async v => { S.useHabitJourney = v; await save(); this.display(); }));
    new Setting(el).setName(t("sRj")).setDesc(t("sRjDesc") + " — " + (rjOk ? t("sDetected") : t("sNotDetected")))
      .addToggle(c => c.setValue(S.useReadingJourney).onChange(async v => { S.useReadingJourney = v; await save(); this.display(); }));
    if (hjOk) {
      new Setting(el).setName(t("sRemap")).setDesc(t("sRemapDesc")).addButton(b => b.setButtonText(t("sRemapBtn")).onClick(async () => {
        const hj = P.bridge.hj();
        const groups = hj ? [...new Set(hj.settings.habits.map(h => h.group || "").filter(Boolean))] : [];
        const n = mapGroups(P.data, groups);
        await save();
        new Notice(t("sRemapDone", { n }));
        this.display();
      }));
    }

    // ---- daily notes
    new Setting(el).setName(t("sDaily")).setHeading();
    new Setting(el).setName(t("sSync")).setDesc(t("sSyncDesc"))
      .addToggle(c => c.setValue(S.syncFrontmatter).onChange(async v => { S.syncFrontmatter = v; await save(); }));
    new Setting(el).setName(t("sFolder")).setDesc(t("sFolderDesc", { folder: P.sync.folder() || "/" }))
      .addText(c => c.setPlaceholder(P.sync.folder() || "Daily Notes").setValue(S.dailyFolder).onChange(async v => { S.dailyFolder = v; await P.save(); }));
    new Setting(el).setName(t("sFormat")).setDesc(t("sFormatDesc"))
      .addText(c => c.setPlaceholder("YYYY-MM-DD").setValue(S.dateFormat).onChange(async v => { S.dateFormat = v.trim() || "YYYY-MM-DD"; await P.save(); }));
    new Setting(el).setName(t("sAutoCreate")).setDesc(t("sAutoCreateDesc"))
      .addToggle(c => c.setValue(S.autoCreateDailyNote).onChange(async v => { S.autoCreateDailyNote = v; await P.save(); }));

    // ---- grace & reports
    new Setting(el).setName(t("sGrace")).setHeading();
    new Setting(el).setName(t("sFreeze")).setDesc(t("sFreezeDesc")).addSlider(s => s
      .setLimits(0, 10, 1).setValue(S.freezePerMonth).setDynamicTooltip()
      .onChange(async v => { S.freezePerMonth = v; await save(); }));

    new Setting(el).setName(t("sReports")).setHeading();
    new Setting(el).setName(t("sReportsFolder"))
      .addText(c => c.setPlaceholder("Reports").setValue(S.reportsFolder).onChange(async v => { S.reportsFolder = v; await P.save(); }));
    new Setting(el).setName(t("sHeatmap")).addDropdown(d => d
      .addOption("90", t("heatmapRange", { n: 90 })).addOption("365", t("heatmapRange", { n: 365 }))
      .setValue(String(S.heatmapDays)).onChange(async v => { S.heatmapDays = v === "365" ? 365 : 90; await save(); }));
    new Setting(el).setName(t("sStatusBar"))
      .addToggle(c => c.setValue(S.showStatusBar).onChange(async v => { S.showStatusBar = v; await save(); }));
    new Setting(el).setName(t("exportReport"))
      .addButton(b => b.setButtonText(t("exportReport")).setCta().onClick(() => exportReport(P)))
      .addButton(b => b.setButtonText(t("sExportPrev")).onClick(() => exportReport(P, previousMonth())));

    // ---- identities CRUD
    new Setting(el).setName(t("sIdentities")).setHeading()
      .addButton(b => b.setButtonText("+ " + t("addIdentity")).onClick(() => new IdentityModal(P, null).open()));
    const habits = P.engine.habits();
    for (const i of P.data.identities) {
      const n = habits.filter(h => h.identityId === i.id && h.active).length;
      const desc = t("habitsCount", { n }) + (i.groups.length ? " · " + i.groups.join(", ") : "");
      new Setting(el).setName(i.icon + " " + loc(i.name, i.nameAr)).setDesc(desc)
        .addExtraButton(b => b.setIcon("pencil").setTooltip(t("edit")).onClick(() => new IdentityModal(P, i).open()));
    }

    // ---- habits CRUD
    new Setting(el).setName(t("sHabits")).setHeading()
      .addButton(b => b.setButtonText("+ " + t("addHabit")).onClick(() => new HabitModal(P, null).open()));
    for (const h of habits.filter(x => x.active)) {
      const id = P.engine.identity(h.identityId);
      const src = h.badge === "RJ" ? t("sourceRj") : h.source === "habit-journey" ? t("sourceHj") : t("sourceNative");
      new Setting(el).setName(h.icon + " " + loc(h.name, h.nameAr))
        .setDesc((id ? id.icon + " " + loc(id.name, id.nameAr) : t("unassigned")) + " · " + t("weightLabel") + " " + h.weight + " · " + h.yamlKey + " · " + src)
        .addExtraButton(b => b.setIcon("pencil").setTooltip(t("edit")).onClick(() => new HabitModal(P, h).open()));
    }

    // ---- data
    new Setting(el).setName(t("sDanger")).setHeading();
    new Setting(el).setName(t("sResetLog")).setDesc(t("sResetLogDesc")).addButton(b => b.setButtonText(t("delete")).setWarning().onClick(() => {
      new ConfirmModal(P, t("sResetLogDesc"), async () => {
        P.data.log = {}; P.data.dayFreeze = {}; P.data.focus = {};
        await save();
        new Notice(t("sResetDone"));
      }).open();
    }));
  }
}

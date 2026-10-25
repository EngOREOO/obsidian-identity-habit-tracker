/* Smoke test: run with `node tests/run.mjs`. Exercises the ported Habit Journey rules and the engine
   against a copy of the real Habit Journey data.json plus synthetic history. */
import { readFileSync } from "node:fs";
import { Bridge } from "../src/integrations/bridge";
import { Engine, levelOf } from "../src/core/engine";
import { addDays, todayKey, weekday, monthKey } from "../src/core/dates";
import { detectPatterns } from "../src/analytics/patternDetector";
import { normalize, mapGroups, SEED_IDENTITIES } from "../src/storage/store";
import { parseYaml } from "../src/storage/yaml";

let fails = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? "  ✓ " : "  ✗ ") + msg); if (!cond) fails++; };

const hjData = JSON.parse(readFileSync(process.argv[2], "utf8"));
const today = todayKey();
// shift the user's real log onto "today" and build 40 days of synthetic history
hjData.challengeStart = addDays(today, -40);
hjData.log = {};
for (let i = 40; i >= 1; i--) {
  const d = addDays(today, -i);
  const day: Record<string, number> = {};
  if (i > 3) day.gym = 1;                       // gym missed the last 3 days
  if (i > 3) day.water = 3;                     // water done whenever gym done → correlation source
  if (weekday(d) !== 4 && weekday(d) !== 5) day["journal"] = 1; // drops on Thu & Fri → friction
  day.meditation = 5;
  hjData.log[d] = day;
}
hjData.log[today] = { meditation: 1 };
const renderers = new Set<{ render(): void }>();
const hj = {
  settings: hjData, renderers,
  setValue(date: string, id: string, v: number) { const d = hjData.log[date] || (hjData.log[date] = {}); if (v > 0) d[id] = v; else delete d[id]; for (const r of renderers) r.render(); },
  addHabit() {}, commit() {},
};
const rjHours: Record<string, number> = { [today]: 1, [addDays(today, -1)]: 3 };
const rj = { settings: { hours: rjHours, dailyHours: 3, dailyNoteFolder: "Daily Tasks & Habits" }, renderers: new Set() };
const app = { plugins: { plugins: { "habit-journey": hj, "reading-journey": rj } } } as any;

let hooked = 0;
const bridge = new Bridge(app, { render: () => hooked++ }, () => ({ hj: true, rj: true }));
const data = normalize({});
data.identities = SEED_IDENTITIES.map(i => ({ ...i, groups: [...i.groups] }));
mapGroups(data, [...new Set<string>(hjData.habits.map((h: any) => h.group))]);
data.seeded = data.hjSeeded = true;
const E = new Engine(() => data, bridge);

console.log("identities:", data.identities.map(i => i.id + "[" + i.groups + "]").join(" "));
ok(data.identities.length === 5, "groups Mind/Body/Study/Spirit map onto 5 identities (3 seed + mindful + Spirit)");

const H = (id: string) => E.habit("hj:" + id)!;
ok(E.habits().length === hjData.habits.length, "every Habit Journey habit is tracked (" + E.habits().length + ")");

// scheduling: سورة الكهف is Friday-only
const kahf = H("weekly-review");
const nextFri = [0,1,2,3,4,5,6].map(n => addDays(today, n)).find(d => weekday(d) === 5)!;
const weekly = { ...hjData.habits.find((h: any) => h.id === "weekly-review"), created: "" };
ok(bridge.hjApplicable(weekly, nextFri) && !bridge.hjApplicable(weekly, addDays(nextFri, 1)), "Friday-only habit is applicable only on Fridays");
ok(!kahf.applicable(addDays(today, -10)), "habit with a future start date is not applicable yet");

// count habit: 1 of 5 prayers → partial → micro
ok(E.status(H("meditation"), today) === "micro", "meditation 1/5 today resolves to micro (partial)");
ok(H("meditation").progress!(today) === "1/5 sessions", "progress label 1/5 sessions → " + H("meditation").progress!(today));
ok(E.status(H("meditation"), addDays(today, -2)) === "done", "meditation 5/5 resolves to done");

// reading type via Reading Journey hours
ok(H("reading").auto, "reading habit is auto when Reading Journey is present");
ok(E.status(H("reading"), addDays(today, -1)) === "done", "3h reading yesterday → done");
ok(E.status(H("reading"), today) === "micro", "1h reading today → micro");
ok(H("reading").identityId === "reader", "reading habit votes for Reader identity");

// never miss twice + adaptive difficulty
const gym = H("gym");
ok(gym.weight === 3 && gym.identityId === "athlete", "gym: weight 3, Athlete identity");
ok(E.status(gym, addDays(today, -1)) === "missed", "gym missed yesterday");
ok(E.isCritical(gym, today), "gym today is a Never-Miss-Twice critical day");
ok(E.needsMicro(gym, today) === 3, "gym adaptive banner after 3 misses → " + E.needsMicro(gym, today));
const c = E.consistency(gym, today);
ok(c.den === 29 && c.hits === 26, "gym consistency 26/29 (today pending excluded) → " + c.hits + "/" + c.den);
ok(E.streak(gym, today) === 0, "gym streak broken");
ok(E.streak(H("meditation"), today) >= 40, "meditation streak counts today's partial → " + E.streak(H("meditation"), today));

// XP & focus
const xpBefore = E.dayXp(addDays(today, -5));
data.focus[addDays(today, -5)] = "athlete"; E.invalidate();
const xpAfter = E.dayXp(addDays(today, -5));
ok(xpAfter - xpBefore === 3 + 1, "focus doubles Athlete XP (gym 3 + water 1 extra) → +" + (xpAfter - xpBefore));
const totals = E.allTimeTotals();
console.log("  all-time XP:", JSON.stringify(totals));
ok(levelOf(totals.athlete).level >= 3, "Athlete reached level " + levelOf(totals.athlete).level + " " + levelOf(totals.athlete).emoji);
ok(levelOf(29).level === 1 && levelOf(30).level === 2 && levelOf(100).level === 3 && levelOf(250).level === 4, "level thresholds 30/100/250");

// freeze
data.settings.freezePerMonth = 2;
const m = monthKey(today);
data.dayFreeze = {};
ok(E.canFreeze(today), "freeze available");
data.log[today] = { "hj:gym": "rest" }; E.invalidate();
ok(E.status(gym, today) === "rest" && E.freezeLeft(m) === 1, "rest mark consumes one freeze day");
ok(!E.isCritical(gym, today), "rest day is not critical");
const c2 = E.consistency(gym, today);
ok(c2.den === 29 && c2.hits === 26, "rest excluded from denominator → " + c2.hits + "/" + c2.den);
data.dayFreeze[addDays(today, -1) < m + "-01" ? today : addDays(today, -1)] = true; E.invalidate();
ok(E.freezeLeft(m) === 0 || monthKey(addDays(today, -1)) !== m, "second freeze day used");
data.log = {}; data.dayFreeze = {}; data.focus = {}; E.invalidate();

// burnout: gym was done 37 days straight until 3 days ago
ok(E.heavyRun(addDays(today, -4)) >= 6, "heavy run detected → " + E.heavyRun(addDays(today, -4)));
ok(E.heavyRun(today) === 0, "no burnout alert after the misses");

// patterns
const ins = detectPatterns(E, today);
for (const i of ins) console.log("   •", i.kind, "—", i.text);
ok(ins.some(i => i.kind === "friction" && i.text.includes("Morning Journal")), "friction insight for Thursday/Friday drop");

// yaml parsing
ok(parseYaml(true) === "done" && parseYaml("micro") === "micro" && parseYaml("rest") === "rest" && parseYaml(false) === "none" && parseYaml(undefined) === null, "frontmatter value parsing");

// bridge hooks and write-back
ok(renderers.size === 1, "registered as a Habit Journey renderer (two-way refresh)");
bridge.hjSetDone(hjData.habits.find((h: any) => h.id === "gym"), today, true);
ok(hjData.log[today].gym === 1 && hooked > 0, "full completion is written back to Habit Journey log");
E.invalidate();
ok(E.status(gym, today) === "done", "and is read back as done");
bridge.detachAll();
ok(renderers.size === 0, "detaches on unload");

console.log(fails ? "\n" + fails + " FAILED" : "\nALL PASSED");
process.exit(fails ? 1 : 0);

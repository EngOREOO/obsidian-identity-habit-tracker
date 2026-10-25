// Bundles the smoke test (no Obsidian runtime needed) and runs it against a Habit Journey data.json.
import esbuild from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "iht-")), "smoke.cjs");
await esbuild.build({ entryPoints: ["tests/engine.smoke.ts"], bundle: true, platform: "node", format: "cjs", outfile: out, external: ["obsidian"], logLevel: "error" });
const data = process.argv[2] || "tests/fixtures/habit-journey.data.json";
execFileSync("node", [out, data], { stdio: "inherit" });

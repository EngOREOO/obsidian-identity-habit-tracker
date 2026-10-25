// Builds the drop-in release folder and the distributable zip (release folder + full source, no node_modules).
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, join, resolve } from "node:path";

const root = resolve(".");
const dist = join(root, "release");
const plug = join(dist, "habit-streak-identity-tracker");
rmSync(dist, { recursive: true, force: true });
mkdirSync(plug, { recursive: true });
for (const f of ["main.js", "manifest.json", "styles.css"]) cpSync(join(root, f), join(plug, f));

const src = join(dist, "source", basename(root));
mkdirSync(src, { recursive: true });
for (const f of ["src", "tests", "scripts", "package.json", "package-lock.json", "tsconfig.json", "esbuild.config.mjs", "manifest.json", "styles.css", "README.md", ".gitignore"]) {
  if (existsSync(join(root, f))) cpSync(join(root, f), join(src, f), { recursive: true });
}
const zip = join(root, "habit-streak-identity-tracker-plugin.zip");
rmSync(zip, { force: true });
execFileSync("zip", ["-rq", "-X", zip, "habit-streak-identity-tracker", "source", "-x", "*.DS_Store"], { cwd: dist, stdio: "inherit" });
console.log("release folder:", plug);
console.log("zip:", zip);

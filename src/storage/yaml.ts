/** Frontmatter value <-> habit state (kept free of runtime Obsidian imports so it is unit-testable). */
export type YamlMark = "done" | "micro" | "rest" | "none";

export function parseYaml(v: unknown): YamlMark | null {
  if (v === undefined) return null;
  if (v === null || v === false || v === 0) return "none";
  if (v === true || v === 1) return "done";
  const s = String(v).trim().toLowerCase();
  if (["true", "yes", "done", "x", "✅", "1"].includes(s)) return "done";
  if (["micro", "partial", "⚡"].includes(s)) return "micro";
  if (["rest", "freeze", "skip", "❄️", "❄"].includes(s)) return "rest";
  if (["", "false", "no", "missed", "0", "pending"].includes(s)) return "none";
  return null;
}


import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) return [];
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

describe("design tokens are the only source of color", () => {
  it("finds no literal hex or rgb colors in app code", () => {
    const root = join(__dirname, "..");
    const offenders = [...files(join(root, "src")), ...files(join(root, "app"))].flatMap((f) => {
      const text = readFileSync(f, "utf8");
      return /#[0-9a-fA-F]{3,8}\b|\brgba?\(/.test(text) ? [f.replace(root, "")] : [];
    });
    expect(offenders).toEqual([]);
  });
});

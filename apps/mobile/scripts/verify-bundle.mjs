// Fails when the development-only gallery is present in a production bundle.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MARKER = "GALLERY_MARKER_7f3a91c2";
const root = join(import.meta.dirname, "..", "dist");

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const bundles = walk(root).filter((f) => /\.(hbc|js)$/.test(f) && f.includes("_expo"));
if (bundles.length === 0) {
  console.error("No bundles found in dist. Run the export first.");
  process.exit(1);
}
const leaked = bundles.filter((f) => readFileSync(f).includes(MARKER));
if (leaked.length > 0) {
  console.error(`Development gallery found in production bundle(s): ${leaked.join(", ")}`);
  process.exit(1);
}
console.log(`Verified ${bundles.length} production bundle(s) contain no development gallery.`);

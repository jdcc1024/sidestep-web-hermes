// One-off: downscale two dev-deployment design images into small JPEGs for
// the mockup (real Sidestep designs: one portrait back view, one wide print
// template). Run from the repo root:
//   node docs/ux/0004-public-form/shrink.mjs <portrait.png> <wide.png>
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const sharp = (await import(pathToFileURL(join(repo, "node_modules/sharp/lib/index.js")).href)).default;
const [portrait, wide] = process.argv.slice(2);
await sharp(portrait).resize({ width: 640 }).flatten({ background: "#000" }).jpeg({ quality: 78 }).toFile(join(here, "design-portrait.jpg"));
await sharp(wide).resize({ width: 900 }).jpeg({ quality: 78 }).toFile(join(here, "design-wide.jpg"));
console.log("ok");

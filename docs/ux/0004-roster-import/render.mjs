// Renders mockup.html to the PNGs next to it. Run from the repo root:
//   node docs/ux/0004-roster-import/render.mjs
// Uses the app's Inter from .next/static/media when a build has left it
// there; otherwise system fonts.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(process.argv[2] ?? join(here, "../../.."));
const { chromium } = await import(
  pathToFileURL(join(repo, "node_modules/playwright/index.mjs")).href
);

let fontCss = "";
const chunks = join(repo, ".next/static/chunks");
if (existsSync(chunks)) {
  for (const f of readdirSync(chunks).filter((n) => n.endsWith(".css"))) {
    const css = readFileSync(join(chunks, f), "utf8");
    const m = css.match(/@font-face\{font-family:Inter;[^}]*?src:url\(\.\.\/media\/([^)]+\.p\.[^)]+)\)/);
    if (m && !fontCss)
      fontCss = `@font-face{font-family:'Inter';font-weight:100 900;src:url('${pathToFileURL(join(repo, ".next/static/media", m[1]))}')}`;
  }
}

const page = pathToFileURL(join(here, "mockup.html")).href;
const browser = await chromium.launch();
const crops = {};
for (const theme of ["light", "dark"])
  for (const state of ["before", "after"]) {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    await p.goto(`${page}?state=${state}&theme=${theme}`);
    if (fontCss) await p.addStyleTag({ content: fontCss });
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: join(here, `${state}-375-${theme}.png`), fullPage: true });
    const m = await p.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      count: document.getElementById("count").textContent,
      items: document.querySelectorAll("#list li").length,
    }));
    console.log(`${state}-375-${theme}.png`, JSON.stringify(m));
    await p.evaluate(() => document.getElementById("tag").remove());
    crops[`${state}-${theme}`] = (await p.locator("#sheet").screenshot()).toString("base64");
    await ctx.close();
  }
for (const theme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 820, height: 800 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const bg = theme === "dark" ? "#0a0a0a" : "#ffffff";
  const fg = theme === "dark" ? "#fafafa" : "#0a0a0a";
  await p.setContent(`<body style="margin:0;background:${bg};color:${fg};font:600 13px system-ui">
    <div style="display:flex;gap:30px;padding:20px;align-items:flex-start">
    ${[["before", "Before: the message pasted as-is (main today)"], ["after", "After: the converted block pasted (proposal)"]]
      .map(([s, t]) => `<figure style="margin:0;width:375px">
      <figcaption style="margin-bottom:8px;letter-spacing:.04em;text-transform:uppercase">${t}</figcaption>
      <img style="width:375px" src="data:image/png;base64,${crops[`${s}-${theme}`]}"></figure>`).join("")}</div></body>`);
  await p.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
  await p.screenshot({ path: join(here, `compare-375-${theme}.png`), fullPage: true });
  console.log(`compare-375-${theme}.png`);
  await ctx.close();
}
await browser.close();
console.log(fontCss ? "fonts: app Inter" : "fonts: system fallback");

// Renders mockup.html to the PNGs next to it. Run from the repo root:
//   node docs/ux/0004-size-chips/render.mjs [/path/to/checkout]
// Uses the app's own Inter / Bebas Neue from .next/static/media when a build
// or dev run has left them there; otherwise falls back to system fonts.
// Optional argument: the checkout that has node_modules and .next (default:
// this repo).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(process.argv[2] ?? join(here, "../../.."));
const { chromium } = await import(
  pathToFileURL(join(repo, "node_modules/playwright/index.mjs")).href
);
const media = join(repo, ".next/static/media");
const chunks = join(repo, ".next/static/chunks");

// Find the font files by family in the built CSS, not by hashed name.
let fontCss = "";
if (existsSync(chunks)) {
  for (const f of readdirSync(chunks).filter((n) => n.endsWith(".css"))) {
    const css = readFileSync(join(chunks, f), "utf8");
    for (const fam of ["Inter", "Bebas Neue"]) {
      const m = css.match(new RegExp(`@font-face\\{font-family:${fam};[^}]*?src:url\\(\\.\\./media/([^)]+\\.p\\.[^)]+)\\)`));
      if (m && !fontCss.includes(`'${fam}'`))
        fontCss += `@font-face{font-family:'${fam}';font-weight:100 900;src:url('${pathToFileURL(join(media, m[1]))}')}`;
    }
  }
}

const page = pathToFileURL(join(here, "mockup.html")).href;
const shots = [];
for (const state of ["before", "after"])
  for (const theme of ["light", "dark"]) {
    shots.push({ file: `${state}-375-${theme}.png`, width: 375, q: `state=${state}&theme=${theme}` });
    shots.push({ file: `${state}-1280-${theme}.png`, width: 1280, q: `state=${state}&theme=${theme}` });
  }
for (const state of ["before", "after"])
  shots.push({ file: `${state}-warning-375-light.png`, width: 375, q: `state=${state}&theme=light&view=warning`, clip: true });

const browser = await chromium.launch();
for (const s of shots) {
  const ctx = await browser.newContext({ viewport: { width: s.width, height: 800 }, deviceScaleFactor: s.width < 640 ? 2 : 1 });
  const p = await ctx.newPage();
  await p.goto(`${page}?${s.q}`);
  if (fontCss) await p.addStyleTag({ content: fontCss });
  await p.evaluate(() => document.fonts.ready);
  const out = join(here, s.file);
  if (s.clip) {
    const box = await p.locator("main").boundingBox();
    await p.screenshot({ path: out, clip: { x: 0, y: 0, width: s.width, height: Math.ceil(box.y + box.height) } });
  } else {
    await p.screenshot({ path: out, fullPage: true });
  }
  // Measure for the spec: horizontal overflow and the footer's height.
  const m = await p.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    footer: Math.round(document.querySelector(".footer")?.getBoundingClientRect().height ?? 0),
    by: [...document.querySelectorAll(".row .by")].map((e) => e.textContent),
    rows: [...document.querySelectorAll(".row")].map((e) => Math.round(e.getBoundingClientRect().height)),
    list: Math.round(document.querySelector("#order-list")?.getBoundingClientRect().height ?? 0),
  }));
  console.log(s.file, JSON.stringify(m));
  await ctx.close();
}
// The Discord image: just the order list card, before | after, one per theme.
for (const theme of ["light", "dark"]) {
  const crops = [];
  for (const state of ["before", "after"]) {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    await p.goto(`${page}?state=${state}&theme=${theme}`);
    if (fontCss) await p.addStyleTag({ content: fontCss });
    await p.evaluate(() => document.fonts.ready);
    await p.evaluate(() => document.getElementById("tag").remove());
    crops.push((await p.locator("#order-list").screenshot()).toString("base64"));
    await ctx.close();
  }
  const ctx = await browser.newContext({ viewport: { width: 820, height: 800 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const bg = theme === "dark" ? "#0a0a0a" : "#ffffff";
  const fg = theme === "dark" ? "#fafafa" : "#0a0a0a";
  await p.setContent(`<body style="margin:0;background:${bg};color:${fg};font:600 13px system-ui">
    <div style="display:flex;gap:30px;padding:20px;align-items:flex-start">
    ${["Before (main today)", "After (proposal)"].map((t, i) => `<figure style="margin:0;width:375px">
      <figcaption style="margin-bottom:8px;letter-spacing:.06em;text-transform:uppercase">${t}</figcaption>
      <img style="width:343px" src="data:image/png;base64,${crops[i]}"></figure>`).join("")}</div></body>`);
  await p.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
  await p.screenshot({ path: join(here, `compare-375-${theme}.png`), fullPage: true });
  console.log(`compare-375-${theme}.png`);
  await ctx.close();
}
await browser.close();
console.log(fontCss ? "fonts: app Inter/Bebas" : "fonts: system fallback");

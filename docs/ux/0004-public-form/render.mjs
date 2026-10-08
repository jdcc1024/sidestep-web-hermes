// Renders mockup.html (AFTER) to PNGs next to it, and builds side-by-side
// before|after images from the real "before" captures (capture.mjs). Run from
// the repo root:  node docs/ux/0004-public-form/render.mjs
// Uses the app's own Inter / Bebas Neue from .next/static when a dev run has
// left them there; otherwise system fonts.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const { chromium } = await import(
  pathToFileURL(join(repo, "node_modules/playwright/index.mjs")).href
);
const media = join(repo, ".next/static/media");
const chunks = join(repo, ".next/static/chunks");

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
const variants = {
  "open-1": "mode=open&designs=1",
  "open-2": "mode=open&designs=2",
  "fixed-2": "mode=fixed&designs=2",
};
const shots = [];
for (const [v, q] of Object.entries(variants))
  for (const theme of ["light", "dark"])
    for (const width of [375, 1280])
      shots.push({ file: `after-${v}-${width}-${theme}.png`, width, q: `${q}&theme=${theme}` });
shots.push({ file: "after-noimage-open-1-375-light.png", width: 375, q: "mode=open&designs=1&img=no&theme=light" });
shots.push({ file: "after-noimage-open-2-375-light.png", width: 375, q: "mode=open&designs=2&img=no&theme=light" });

const browser = await chromium.launch();
async function open(width, q) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: width < 640 ? 2 : 1 });
  const p = await ctx.newPage();
  await p.goto(`${page}?${q}`);
  if (fontCss) await p.addStyleTag({ content: fontCss });
  await p.evaluate(() => document.fonts.ready);
  await p.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
  return { ctx, p };
}
for (const s of shots) {
  const { ctx, p } = await open(s.width, s.q);
  await p.screenshot({ path: join(here, s.file), fullPage: true });
  const m = await p.evaluate(() => {
    const r = (e) => e.getBoundingClientRect();
    const tiles = [...document.querySelectorAll(".sc")].map((e) => Math.round(r(e).width));
    const lefts = [...document.querySelectorAll(".jcard .sizes, .ppanel .sizes")].map((e) => Math.round(r(e).left));
    const nn = document.querySelector(".nn");
    return {
      page: Math.round(document.documentElement.scrollHeight),
      scrollW: document.documentElement.scrollWidth,
      tile: tiles.length ? `${Math.min(...tiles)}-${Math.max(...tiles)}x40` : null,
      gridLefts: [...new Set(lefts)],
      nameNum: nn ? [...nn.querySelectorAll(".input")].map((e) => Math.round(r(e).width)) : null,
      card: [...document.querySelectorAll(".jcard")].map((e) => Math.round(r(e).height)),
      rows: [...document.querySelectorAll(".pbtn")].map((e) => Math.round(r(e).height)),
      numLeft: [...document.querySelectorAll(".pnum")].map((e) => Math.round(r(e).right)),
      yourJerseysY: Math.round(r(document.querySelector(".shead")).top + scrollY),
    };
  });
  console.log(s.file, JSON.stringify(m));
  await ctx.close();
}

// Side-by-side for Discord: real main | proposal, at 375, per variant/theme.
for (const v of Object.keys(variants))
  for (const theme of ["light", "dark"]) {
    const before = readFileSync(join(here, `before-${v}-375-${theme}.png`)).toString("base64");
    const after = readFileSync(join(here, `after-${v}-375-${theme}.png`)).toString("base64");
    const ctx = await browser.newContext({ viewport: { width: 820, height: 800 }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    const bg = theme === "dark" ? "#0a0a0a" : "#ffffff";
    const fg = theme === "dark" ? "#fafafa" : "#0a0a0a";
    await p.setContent(`<body style="margin:0;background:${bg};color:${fg};font:600 13px system-ui">
      <div style="display:flex;gap:30px;padding:20px;align-items:flex-start">
      ${[["Before (main today, real capture)", before], ["After (proposal)", after]].map(([t, b]) => `<figure style="margin:0;width:375px">
        <figcaption style="margin-bottom:8px;letter-spacing:.06em;text-transform:uppercase">${t}</figcaption>
        <img style="width:375px;border:1px solid #8884" src="data:image/png;base64,${b}"></figure>`).join("")}</div></body>`);
    await p.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
    await p.screenshot({ path: join(here, `compare-${v}-375-${theme}.png`), fullPage: true });
    console.log(`compare-${v}-375-${theme}.png`);
    await ctx.close();
  }
await browser.close();
console.log(fontCss ? "fonts: app Inter/Bebas" : "fonts: system fallback");

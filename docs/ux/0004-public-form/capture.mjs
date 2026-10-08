// Captures the public order form as it is on main today ("before" shots).
// Run from the repo root with the dev server up (npm run dev → :8080):
//   node docs/ux/0004-public-form/capture.mjs <orderFormId> <variant>
// variant: open-2 | open-1 | fixed-2  (the data state is set by the caller:
// names mode via orderForms:setNamesMode, one vs two designs via
// _devSeed:setFixtureDesignRemoved). Writes before-<variant>-<w>-<theme>.png
// next to this file and prints measurements used in the spec.
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const { chromium } = await import(
  pathToFileURL(join(repo, "node_modules/playwright/index.mjs")).href
);
const [formId, variant] = process.argv.slice(2);
const base = process.env.SNAP_BASE ?? "http://localhost:8080";

const browser = await chromium.launch();
for (const width of [375, 1280])
  for (const theme of ["light", "dark"]) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: width < 640 ? 2 : 1,
      colorScheme: theme,
    });
    const p = await ctx.newPage();
    await p.goto(`${base}/run/${formId}`);
    await p.getByRole("button", { name: "Submit" }).waitFor();
    await p.getByLabel("Your name").fill("Pat Morrison");
    await p.getByLabel("Your email").fill("pat@example.com");

    if (variant.startsWith("open")) {
      const cards = [
        { design: "Home", name: "Sidestep", number: "72", sizes: ["S", "M", "M", "M", "XL"] },
        { design: "Away", name: "Alexandra Vandermeulen-Okafor", number: "7", sizes: ["L"] },
        { design: "Home", name: "Bo", number: "", sizes: ["2XL", "2XL"] },
      ];
      for (let i = 0; i < cards.length; i++) {
        if (i > 0)
          await p.getByRole("button", { name: "Add a different name or number" }).click();
        const card = p.getByRole("group", { name: `Jersey ${i + 1}` });
        const c = cards[i];
        if (variant === "open-2") {
          await card.getByRole("combobox").click();
          await p.getByRole("option", { name: new RegExp(c.design) }).click();
        }
        await card.getByLabel("Name on jersey").fill(c.name);
        await card.getByLabel("Number").fill(c.number);
        for (const s of c.sizes)
          await card.getByRole("button", { name: `Add one ${s}`, exact: true }).click();
      }
    } else {
      // Fixed mode: tap a few sizes on a few roster rows.
      const taps = [
        ["Avery Quinn", "M"], ["Sidestep", "S"], ["Sidestep", "M"], ["Sidestep", "M"],
        ["Sidestep", "XL"], ["Riley Tran", "L"],
      ];
      for (const [who, s] of taps)
        await p.getByRole("button", { name: `Add one ${s} for ${who}`, exact: true }).click();
    }
    await p.mouse.move(0, 0);
    await p.waitForTimeout(300);

    const file = `before-${variant}-${width}-${theme}.png`;
    await p.screenshot({ path: join(here, file), fullPage: true });

    const m = await p.evaluate(() => {
      const r = (el) => el && el.getBoundingClientRect();
      const counters = [...document.querySelectorAll("button[aria-label^='Add one']")]
        .map((b) => b.parentElement);
      const c0 = r(counters[0]);
      const inputs = [...document.querySelectorAll("input")].map((i) => {
        const b = r(i);
        return `${i.name || i.id}:${Math.round(b.width)}x${Math.round(b.height)}`;
      });
      const rows = [...document.querySelectorAll("fieldset li")].map((li) => {
        const name = li.querySelector("span span");
        const grid = li.querySelector("div");
        return { name: name?.textContent, nameW: Math.round(r(name).width), h: Math.round(r(li).height), gridLeft: Math.round(r(grid).left) };
      });
      const submit = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Submit");
      const add = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Add a different"));
      const ys = (re) => {
        const el = [...document.querySelectorAll("h2,legend")].find((e) => re.test(e.textContent));
        return el ? Math.round(r(el).top + window.scrollY) : null;
      };
      return {
        page: Math.round(document.documentElement.scrollHeight),
        scrollW: document.documentElement.scrollWidth,
        counter: c0 && `${Math.round(c0.width)}x${Math.round(c0.height)}`,
        counters: counters.length,
        submit: submit && `${Math.round(r(submit).width)}x${Math.round(r(submit).height)}`,
        add: add && `${Math.round(r(add).width)}x${Math.round(r(add).height)}`,
        yourJerseysY: ys(/Your jerseys/),
        inputs,
        rows,
      };
    });
    console.log(file, JSON.stringify(m));
    await ctx.close();
  }
await browser.close();

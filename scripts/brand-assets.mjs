// Regenerates raster brand assets from the SVG mark: `node scripts/brand-assets.mjs`.
// Uses Playwright's Chromium (PW_CHROMIUM_PATH to override). Output is committed.
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const TEAL = "#007974", INK = "#182029", BG = "#f8fbfb", MUTED = "#5b6573";
const lines = (stroke) =>
  `<g fill="none" stroke="${stroke}" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 23V9.5l7 7 7.5-7.5"/><path d="M17.5 9H23.5V15"/></g><circle cx="23.5" cy="22.5" r="2" fill="${stroke}"/>`;
// rx: corner radius; pad: safe-zone inset (maskable icons).
const mark = (size, { rx = 9, pad = 0 } = {}) => {
  const s = 32 / (1 - 2 * pad), o = -(s - 32) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${o} ${o} ${s} ${s}"><rect x="${o}" y="${o}" width="${s}" height="${s}" rx="${rx}" fill="${TEAL}"/>${lines("#fff")}</svg>`;
};
const og = `<div style="width:1200px;height:630px;display:flex;flex-direction:column;justify-content:center;padding:0 96px;box-sizing:border-box;background:radial-gradient(circle at 85% 20%,#e0f3f1,${BG} 55%);font-family:Inter,Geist,system-ui,sans-serif">
  <div style="display:flex;align-items:center;gap:28px">${mark(112)}<span style="font-size:76px;font-weight:650;color:${INK};letter-spacing:-2px">MoneyPilot</span></div>
  <p style="margin:36px 0 0;font-size:38px;color:${MUTED};max-width:900px;line-height:1.3">Personal finance with an AI co-pilot. Ask about your money in plain words.</p></div>`;

const ico = (pngs) => {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let off = head.length;
  pngs.forEach(([size, buf], i) => {
    const e = 6 + 16 * i;
    head[e] = size; head[e + 1] = size; head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(buf.length, e + 8); head.writeUInt32LE(off, e + 12); off += buf.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p[1])]);
};

const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const page = await browser.newPage();
async function shot(html, w, h, omitBackground = true) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<body style="margin:0">${html}</body>`);
  return page.screenshot({ omitBackground, clip: { x: 0, y: 0, width: w, height: h } });
}
const out = {
  "public/icon-192.png": await shot(mark(192, { rx: 7 }), 192, 192),
  "public/icon-512.png": await shot(mark(512, { rx: 7 }), 512, 512),
  "public/icon-maskable-512.png": await shot(mark(512, { rx: 0, pad: 0.12 }), 512, 512, false),
  "app/apple-icon.png": await shot(mark(180, { rx: 0, pad: 0.06 }), 180, 180, false),
  "app/opengraph-image.png": await shot(og, 1200, 630, false),
};
out["app/favicon.ico"] = ico([[16, await shot(mark(16, { rx: 8 }), 16, 16)], [32, await shot(mark(32), 32, 32)], [48, await shot(mark(48), 48, 48)]]);
for (const [f, b] of Object.entries(out)) writeFileSync(f, b);
await browser.close();
console.log("wrote", Object.keys(out).join(", "));

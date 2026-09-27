/**
 * Canvas FPS benchmark (headless Chrome, real build + real WS server).
 *
 * Spawns the WS daemon (port 4001) and `vite preview` for the production
 * build, loads the app in headless Chrome via playwright-core, then:
 *   1. counts rendered nodes/edges + store counts from the header,
 *   2. samples requestAnimationFrame for 5s idle (live 1s tick stream),
 *   3. performs scripted pan drags + wheel zooms and samples FPS during it,
 *   4. reports longtasks + JS heap.
 *
 * Run:  node bench-fps.mjs [--preview-port 4173]
 * Env:  CHROME_PATH overrides the Chrome executable.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import { chromium } from "playwright-core";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const SERVER_DIR = path.join(ROOT, "..", "server");
const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const args = process.argv.slice(2);
const pi = args.indexOf("--preview-port");
const PREVIEW_PORT = pi >= 0 ? Number(args[pi + 1]) : 4173;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function start(cmd, cmdArgs, cwd, extraEnv = {}, logFile = null) {
  const child = spawn(cmd, cmdArgs, {
    cwd,
    env: { ...process.env, ...extraEnv },
    stdio: logFile ? ["ignore", "ignore", fs.openSync(logFile, "a")] : "ignore",
  });
  return child;
}

async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error(`never came up: ${url}`);
}

async function waitForWs(port, tries = 60) {
  // Plain TCP probe: no extra deps needed.
  for (let i = 0; i < tries; i++) {
    const ok = await new Promise((resolve) => {
      const s = net.connect(port, "127.0.0.1", () => {
        s.destroy();
        resolve(true);
      });
      s.on("error", () => resolve(false));
      setTimeout(() => {
        s.destroy();
        resolve(false);
      }, 400);
    });
    if (ok) return;
    await sleep(500);
  }
  throw new Error(`ws never came up on :${port}`);
}

/** Sample rAF timestamps in-page for `ms`, return frame stats. */
function sampleFrames(page, ms) {
  return page.evaluate(
    (dur) =>
      new Promise((resolve) => {
        const ts = [];
        const t0 = performance.now();
        const tick = (t) => {
          ts.push(t);
          if (t - t0 < dur) requestAnimationFrame(tick);
          else {
            const gaps = ts.slice(1).map((v, i) => v - ts[i]);
            gaps.sort((a, b) => a - b);
            const q = (p) => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))];
            resolve({
              frames: ts.length,
              seconds: (ts[ts.length - 1] - ts[0]) / 1000,
              medianFrameMs: Number(q(0.5).toFixed(2)),
              p95FrameMs: Number(q(0.95).toFixed(2)),
            });
          }
        };
        requestAnimationFrame(tick);
      }),
    ms
  );
}

let code = 0;
const kids = [];
const pageErrors = [];
try {
  const wsLog = path.join(os.tmpdir(), "netsight-bench-ws.log");
  try {
    fs.unlinkSync(wsLog);
  } catch {
    /* fresh log */
  }
  kids.push(start(process.execPath, ["dist/index.js"], SERVER_DIR, { PORT: "4001" }, wsLog));
  kids.push(
    start("node", ["node_modules/vite/bin/vite.js", "preview", "--port", String(PREVIEW_PORT), "--strictPort"], ROOT)
  );
  await waitForWs(4001);
  await waitFor(`http://localhost:${PREVIEW_PORT}/`);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "netsight-bench-"));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: CHROME,
    viewport: { width: 1440, height: 900 },
    args: ["--no-first-run", "--disable-dev-shm-usage"],
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__longtasks = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__longtasks.push(e.duration);
    }).observe({ entryTypes: ["longtask"] });
  });
  await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: "load" });
  page.on("pageerror", (e) => pageErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") pageErrors.push(`console: ${m.text()}`);
  });
  let headerText = "";
  try {
    await page.waitForFunction(
      () => /open · \d+ nodes · \d+ links/.test(document.body.innerText),
      { timeout: 45000 }
    );
  } catch {
    headerText = await page.evaluate(() => document.body.innerText.slice(0, 300));
    throw new Error(`stream never reached open state; header said: ${JSON.stringify(headerText)}`);
  }
  await sleep(1500); // let first paint + one tick settle

  // Wait for the canvas to reach steady state (edge count stable across
  // two 1s polls) so the idle sample measures streaming, not mounting.
  const edgeCount = () => page.evaluate(() => document.querySelectorAll(".react-flow__edge").length);
  let steadyEdges = await edgeCount();
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    const now = await edgeCount();
    if (now === steadyEdges && now > 0) break;
    steadyEdges = now;
  }
  await sleep(3000);

  const dom = await page.evaluate(() => ({
    header: document.querySelector("header p")?.innerText ?? "",
    flowNodes: document.querySelectorAll(".react-flow__node").length,
    flowEdges: document.querySelectorAll(".react-flow__edge").length,
    canvases: document.querySelectorAll("#canvas canvas").length,
    heapMB:
      "memory" in performance
        ? Number((performance.memory.usedJSHeapSize / 1048576).toFixed(1))
        : null,
  }));

  const idle = await sampleFrames(page, 5000);

  // Scripted interaction: pan drags + wheel zooms over the canvas.
  const box = await page.locator(".react-flow").boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const viewportTransform = () =>
    page.evaluate(() => document.querySelector(".react-flow__viewport")?.style.transform ?? "none");
  const transformBefore = await viewportTransform();
  const interacting = sampleFrames(page, 9000);
  for (let d = 0; d < 3; d++) {
    await page.mouse.move(cx - 250, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 250, cy + 120, { steps: 25 });
    await page.mouse.up();
    await sleep(250);
  }
  await page.mouse.move(cx, cy);
  for (let z = 0; z < 8; z++) {
    await page.mouse.wheel(0, z % 2 ? 400 : -400);
    await sleep(300);
  }
  const busy = await interacting;
  const transformAfter = await viewportTransform();

  const longtasks = await page.evaluate(() => ({
    count: window.__longtasks.length,
    maxMs: window.__longtasks.length ? Number(Math.max(...window.__longtasks).toFixed(1)) : 0,
  }));
  const ua = await page.evaluate(() => navigator.userAgent);
  const chromeVersion = /Chrome\/(\S+)/.exec(ua)?.[1] ?? ua;
  await context.close();

  const fps = (s) => Number((s.frames / s.seconds).toFixed(1));
  console.log(
    JSON.stringify(
      {
        chrome: chromeVersion,
        headless: true,
        viewport: "1440x900",
        ...dom,
        idle5s: { ...idle, fps: fps(idle) },
        panZoom9s: { ...busy, fps: fps(busy) },
        viewportTransformBefore: transformBefore,
        viewportTransformAfter: transformAfter,
        longtasks,
      },
      null,
      2
    )
  );
} catch (err) {
  console.error("bench failed:", err.message);
  if (pageErrors.length) console.error("page errors:", JSON.stringify(pageErrors.slice(0, 5)));
  try {
    const wsLog = fs.readFileSync(path.join(os.tmpdir(), "netsight-bench-ws.log"), "utf8");
    if (wsLog.trim()) console.error("ws server log tail:", JSON.stringify(wsLog.trim().slice(-500)));
  } catch {
    /* no server log */
  }
  code = 1;
} finally {
  for (const k of kids) k.kill();
}
process.exit(code);

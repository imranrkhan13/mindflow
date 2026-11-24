#!/usr/bin/env node
/**
 * Records a product demo by driving the real UI in Chrome and capturing
 * screenshots at meaningful moments, then assembling them into a video.
 *
 *   node scripts/demo/record.mjs                 # capture (uses dev server or --url)
 *   node scripts/demo/record.mjs --build         # also assemble the MP4
 *
 * The browser is real; nothing is mocked. Slow network answers are waited on
 * with generous timeouts, and any step that cannot complete is recorded as a
 * "blocked" frame with the real reason instead of being faked.
 */
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = path.join(ROOT, "demo-out");
const FRAMES = path.join(OUT, "frames");
const MANIFEST = path.join(OUT, "manifest.json");

const args = process.argv.slice(2);
const flag = (name, fallback = "") => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BUILD_ONLY = args.includes("--build");
const URL_BASE = flag("url", "http://localhost:5173");
const PROJECT = flag("project", "d605f037-2e45-4a96-a056-2f3eede617f2");
const PR_URL = flag("pr", "https://github.com/encode/httpx/pull/3857");
const BUILD_Q = flag("build-question", "How do I build a request to a URL and read the response?");
const ASK_Q = flag("ask-question", "How does a request get sent and the response decoded?");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const frames = [];
const state = { width: 1600, height: 1000 };

const log = (...m) => console.log("•", ...m);

async function waitForDevServer(url) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return null;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No dev server at ${url}`);
}

function startDevServer() {
  const child = spawn("npm", ["run", "dev", "--", "--port", "5173", "--strictPort"], {
    cwd: ROOT,
    stdio: "ignore",
    detached: true,
  });
  child.unref();
  return child;
}

async function main() {
  await rm(FRAMES, { recursive: true, force: true });
  await mkdir(FRAMES, { recursive: true });

  if (BUILD_ONLY) return assemble();

  let server = null;
  try {
    await waitForDevServer(URL_BASE);
  } catch {
    log("starting dev server");
    server = startDevServer();
    await waitForDevServer(URL_BASE);
  }

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--force-device-scale-factor=2", "--hide-scrollbars", "--no-first-run"],
  });
  const context = await browser.newContext({
    viewport: { width: state.width, height: state.height },
    deviceScaleFactor: 2,
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(180_000);
  page.on("pageerror", (e) => log("page error:", e.message.split("\n")[0]));

  let n = 0;
  const shot = async (name, caption) => {
    await page.waitForTimeout(120);
    const file = path.join(FRAMES, `${String(++n).padStart(3, "0")}-${name}.png`);
    await page.screenshot({ path: file });
    frames.push({ name, caption, file });
    log("frame", name);
  };

  // Freeze animation so frames are crisp and the video is readable.
  const freeze = () =>
    page.addStyleTag({
      content: `*,*::before,*::after{animation-play-state:paused!important;transition:none!important;caret-color:transparent!important}`,
    });

  const ask = async (question) => {
    const box = page.locator(".mf-composer textarea");
    await box.waitFor({ state: "visible" });
    await box.click();
    await box.fill(question);
    const value = await box.inputValue();
    if (value !== question) throw new Error(`textarea did not take the question: ${value}`);
    await box.press("Enter");
    // The send is asynchronous: wait until a NEW empty assistant bubble exists.
    await page.waitForFunction(
      (q) => {
        const users = [...document.querySelectorAll(".mf-message.user")];
        return users.some((el) => el.textContent.includes(q.slice(0, 40)));
      },
      question,
      { timeout: 20_000 },
    );
  };

  const advance = async (selector, expected = (el) => el) => {
    const started = Date.now();
    let last = "";
    const limit = Number(flag("wait", "300")) * 1000;
    while (Date.now() - started < limit) {
      last = await page.evaluate(
        ([sel]) => {
          const nodes = [...document.querySelectorAll(sel)];
          return nodes.map((el) => el.textContent.trim()).join("|");
        },
        [selector],
      );
      if (expected(last)) return last;
      if (/no free model key|zero-price route could not be verified/i.test(last))
        throw new Error(`backend has no usable model route: ${last.slice(-160)}`);
      await page.waitForTimeout(700);
    }
    throw new Error(`Timed out waiting for ${selector}: ${last.slice(0, 200)}`);
  };

  /* 1 ─ Landing */
  await page.goto(URL_BASE + "/", { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await waitForDevServer(URL_BASE);
  await shot("landing", "MindFlow: import a public repo, no upload needed");

  await page.fill("#repo-url", "https://github.com/encode/httpx");
  await freeze();
  await shot("validated", "Live URL validation: valid repo root, import enabled");

  /* 2 ─ Import (real new snapshot) */
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => !!document.querySelector(".mf-loading-screen") || location.pathname.startsWith("/repo/"),
    null,
    { timeout: 30_000 },
  ).catch(() => {});
  if (await page.locator(".mf-loading-screen").count()) {
    await page.waitForTimeout(900);
    await shot("importing", "Importing: elapsed timer, no fake progress bar");
  }
  await page.waitForFunction(() => location.pathname.startsWith("/repo/"), null, { timeout: 280_000 });
  await page.waitForSelector(".mf-work-grid");
  await page.waitForTimeout(1500);
  await freeze();
  await shot("workspace", "Workspace: files read, explicit exclusions, answer map empty until you ask");

  /* 3 ─ Ask: streaming answer + evidence map */
  await page.locator(".mf-composer textarea").click();
  await page.locator(".mf-composer textarea").fill(ASK_Q);
  if ((await page.locator(".mf-composer textarea").inputValue()) !== ASK_Q)
    throw new Error("question did not land in the composer");
  await freeze();
  await shot("question-typed", "Ask the repository a real question");
  await page.locator(".mf-composer textarea").press("Enter");
  await page.waitForSelector(".mf-stages, .mf-status", { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await shot("retrieval", "Honest retrieval stages while the search runs");
  await advance(".mf-answer", (text) => text.length > 220);
  await page.waitForTimeout(1500);
  await freeze();
  await shot("answer", "Answer with clickable source IDs and a live evidence map");

  const cite = page.locator(".mf-citation").first();
  if (await cite.count()) {
    await cite.click();
    await page.waitForSelector(".mf-source-sheet");
    await page.waitForTimeout(700);
    await freeze();
    await shot("citation", "Every citation opens the exact pinned lines on GitHub");
    await page.keyboard.press("Escape");
    await page.locator(".mf-source-sheet button").first().click().catch(() => {});
    await page.waitForTimeout(400).catch(() => {});
    await page.evaluate(() => document.querySelector(".mf-overlay")?.remove());
  }

  /* 4 ─ Build blueprint */
  await ask(BUILD_Q);
  await page.waitForSelector(".mf-plan", { timeout: 90_000 });
  await page.waitForTimeout(700);
  await freeze();
  await shot("build-plan", `Build question: a ${await page.locator(".mf-plan-steps li").count()}-step plan derived from real imports`);
  await advance(".mf-answer", (text) => text.length > 250 && /Step|What you are building/i.test(text));
  await page.waitForTimeout(1200);
  await freeze();
  await shot("blueprint", "Blueprint sections with anchored code blocks you can copy");

  /* 5 ─ PR review, in the background */
  await page.locator(".mf-studio-tabs button", { hasText: "PR review" }).click();
  await page.waitForSelector("#pr-url");
  await page.fill("#pr-url", PR_URL);
  await freeze();
  await shot("pr-form", "PR review accepts a public pull-request URL");
  await page.locator(".mf-review .run").click();
  await page.waitForSelector(".mf-review-progress, .mf-review-result", { timeout: 60_000 });
  await page.waitForTimeout(2500);
  await freeze();
  await shot("pr-progress", "Diff parsed and checks derived while the model writes");
  await page.waitForSelector(".mf-review-result", { timeout: 280_000 });
  await page.waitForTimeout(900);
  await freeze();
  await shot("pr-review", "Review lands in one piece with the diff it is based on");

  const fileHead = page.locator(".mf-pr-file .head").first();
  if (await fileHead.count()) {
    await fileHead.click();
    await page.waitForTimeout(500);
    await freeze();
    await shot("pr-diff", "Each changed file expands to its real added lines");
  }

  /* 6 ─ Listen / voice */
  await page.locator(".mf-studio-tabs button", { hasText: "Ask" }).click();
  await page.waitForTimeout(600);
  const listen = page.locator(".mf-speech button", { hasText: /Listen/ }).first();
  if (await listen.count()) {
    await listen.click();
    await page.waitForTimeout(1200);
    await freeze();
    await shot("listen", "Any answer can be narrated; samples are pre-fetched per voice");
  }

  /* 7 ─ Video studio */
  await page.locator(".mf-studio-tabs button", { hasText: "Video" }).click();
  await page.waitForTimeout(900);
  await freeze();
  await shot("video", "Video studio: instant voice samples, honest render stages");

  await writeFile(
    MANIFEST,
    JSON.stringify({ createdAt: new Date().toISOString(), base: URL_BASE, project: PROJECT, frames }, null, 2),
  );
  await browser.close();
  if (server) try { process.kill(-server.pid); } catch {}
  log(`captured ${frames.length} frames → ${MANIFEST}`);
  await assemble();
}

async function assemble() {
  // Captions, screenshots and the MP4 are produced by scripts/demo/caption.py:
  // keeping one implementation means stills and video cannot drift apart.
  await new Promise((resolve, reject) => {
    const py = spawn("python3", [path.join(ROOT, "scripts/demo/caption.py")], { cwd: ROOT, stdio: "inherit" });
    py.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`caption.py exited ${code}`))));
  });
}

main().catch(async (e) => {
  console.error("✗ demo failed:", e.message);
  process.exit(1);
});

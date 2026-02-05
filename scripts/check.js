// scripts/check.js
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
const toMs = (sec, def = 10) => Math.max(1, Number.isFinite(+sec) ? +sec : def) * 1000;

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function nowParisISO() {
  const d = new Date();
  const tz = Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", timeZoneName: "short" })
    .formatToParts(d).find(p => p.type === "timeZoneName")?.value || "CET";
  const s = d.toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
  return `${s} (${tz})`;
}

async function fetchWithTimeout(url, { method = "GET", timeoutMs = 50000, headers = {} } = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = performance.now();
  try {
    const resp = await fetch(url, {
      method,
      headers,
      signal: controller.signal,
      redirect: "follow"
    });
    const t1 = performance.now();
    const text = await resp.text(); // keep body for mustContain
    return {
      ok: true,
      status: resp.status,
      urlFinale: resp.url || url,
      durationMs: Math.round(t1 - t0),
      body: text,
      headers: {
        "content-type": resp.headers.get("content-type") || "",
        "content-length": resp.headers.get("content-length") || ""
      }
    };
  } catch (e) {
    const t1 = performance.now();
    return {
      ok: false,
      error: e.name === "AbortError" ? "TIMEOUT" : (e.message || "NETWORK_ERROR"),
      durationMs: Math.round(t1 - t0)
    };
  } finally {
    clearTimeout(id);
  }
}

async function runOnce(check) {
  const res = await fetchWithTimeout(check.url, {
    method: check.method || "GET",
    timeoutMs: toMs(check.timeoutSec, 50),
    headers: check.headers || {}
  });

  if (!res.ok) {
    return {
      ok: false,
      reason: res.error,
      status: 0,
      durationMs: res.durationMs,
      urlFinale: check.url
    };
  }

  const status = res.status;

  // Check status expectations (only use one: expectStatus, expectStatusIn, or expectStatusLt)
  if (typeof check.expectStatus === "number" && status !== check.expectStatus) {
    return { ok: false, reason: `HTTP ${status} (expected ${check.expectStatus})`, status, ...res };
  }
  if (Array.isArray(check.expectStatusIn) && !check.expectStatusIn.includes(status)) {
    return { ok: false, reason: `HTTP ${status} (expected one of: ${check.expectStatusIn.join(", ")})`, status, ...res };
  }
  if (typeof check.expectStatusLt === "number" && !(status < check.expectStatusLt)) {
    return { ok: false, reason: `HTTP ${status} (expected < ${check.expectStatusLt})`, status, ...res };
  }
  if (check.mustContain) {
    const body = res.body || "";
    if (!body.includes(check.mustContain)) {
      return {
        ok: false,
        reason: `Body missing "${check.mustContain}"`,
        status,
        ...res
      };
    }
  }
  return { ok: true, status, ...res };
}

async function runWithRetries(check) {
  const tries = Math.max(0, Number(check.retries ?? 0)) + 1;
  let last = null;
  for (let i = 0; i < tries; i++) {
    last = await runOnce(check);
    if (last.ok) return last;
    if (i < tries - 1) await sleep(500 * (i + 1)); // small backoff
  }
  return last;
}

function summarizeResult(r, app, name, url) {
  const base = `${r.ok ? "OK   " : "FAIL "} ${app}/${name} -> ${r.ok ? `HTTP ${r.status}` : r.reason} | ${url}`;
  const extra = r.ok
    ? `  [${r.durationMs}ms] ${r.urlFinale !== url ? `-> ${r.urlFinale} ` : ""}${r.headers?.["content-type"] || ""}`
    : `  [${r.durationMs}ms]`;
  return `${base}\n${extra}`;
}

function bodySnippet(body, max = 300) {
  if (!body) return "";
  const s = body.slice(0, max);
  return s.replaceAll("\u0000", "");
}

async function main() {
  const configPath = path.join(process.cwd(), "config", "sites.json");
  const raw = fs.readFileSync(configPath, "utf8");
  const apps = JSON.parse(raw);

  /** Collect all jobs without stopping on first failure */
  /** @type {Array<{app:string,name:string,url:string,result:any}>} */
  const results = [];

  // Controlled concurrency (8 in parallel)
  const tasks = [];
  const pool = [];
  const POOL_SIZE = 8;

  for (const app of apps) {
    for (const check of app.checks) {
      const url = check.url;
      const name = check.name;
      const job = (async () => {
        const result = await runWithRetries(check);
        results.push({ app: app.app, name, url, result });
      })();
      tasks.push(job);
    }
  }

  for (const t of tasks) {
    const p = t.then(() => pool.splice(pool.indexOf(p), 1)).catch(() => pool.splice(pool.indexOf(p), 1));
    pool.push(p);
    if (pool.length >= POOL_SIZE) {
      await Promise.race(pool);
    }
  }
  await Promise.allSettled(pool);

  console.log("=== SUMMARY ===");
  for (const r of results) {
    console.log(summarizeResult(r.result, r.app, r.name, r.url));
  }

  const failures = results.filter(r => !r.result.ok);

  const token = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (failures.length > 0 && token && chatId) {
    const header =
      `🚨 <b>Site monitor</b>\n` +
      `${nowParisISO()}\n` +
      `Incidents: <b>${failures.length}</b> / ${results.length}\n`;

    const blocks = failures.map(f => {
      const rr = f.result;
      const lines = [
        `• <b>${escapeHtml(f.app)}/${escapeHtml(f.name)}</b>`,
        `URL: <code>${escapeHtml(f.url)}</code>`,
        rr.urlFinale && rr.urlFinale !== f.url ? `Final: <code>${escapeHtml(rr.urlFinale)}</code>` : null,
        rr.status ? `Status: <b>${rr.status}</b>` : `Status: <b>—</b>`,
        `Cause: <i>${escapeHtml(rr.reason || "Unknown")}</i>`,
        `Latency: <code>${rr.durationMs}ms</code>`,
        rr.headers?.["content-type"] ? `Content-Type: <code>${escapeHtml(rr.headers["content-type"])}</code>` : null,
        rr.headers?.["content-length"] ? `Content-Length: <code>${escapeHtml(rr.headers["content-length"])}</code>` : null,
        rr.body ? `Body (extrait):\n<code>${escapeHtml(bodySnippet(rr.body, 300))}</code>` : null
      ].filter(Boolean);
      return lines.join("\n");
    });

    const text = [header, ...blocks].join("\n\n");

    const { sendTelegramMessage } = await import("./telegram.js");
    await sendTelegramMessage({ token, chatId, text }).catch(e => {
      console.error("Telegram send failed:", e);
    });
  }

  // Keep job green by default. To fail on incidents, swap next line.
  // process.exit(failures.length > 0 ? 1 : 0);
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

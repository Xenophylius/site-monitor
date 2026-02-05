export type Check = {
  name: string;
  url: string;
  method?: string;
  timeoutSec?: number;
  retries?: number;
  expectStatus?: number;
  expectStatusIn?: number[];
  expectStatusLt?: number;
  mustContain?: string;
  headers?: Record<string, string>;
};
export type AppChecks = { app: string; checks: Check[] };
export type CheckResult = {
  app: string; name: string; url: string; ok: boolean;
  status?: number; reason?: string; durationMs: number;
  urlFinal?: string; headers?: Record<string, string>; bodySnippet?: string;
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const toMs = (sec?: number, def = 10) => Math.max(1, Number.isFinite(Number(sec)) ? Number(sec) : def) * 1000;

async function fetchWithTimeout(url: string, opts: { method?: string; timeoutMs?: number; headers?: Record<string, string> } = {}) {
  const { method = "GET", timeoutMs = 10000, headers = {} } = opts;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = performance.now();
  try {
    const resp = await fetch(url, { method, headers, redirect: "follow", signal: controller.signal });
    const t1 = performance.now();
    const text = await resp.text();
    return {
      ok: true as const,
      status: resp.status,
      urlFinal: (resp as any).url || url,
      durationMs: Math.round(t1 - t0),
      body: text,
      headers: {
        "content-type": resp.headers.get("content-type") || "",
        "content-length": resp.headers.get("content-length") || ""
      }
    };
  } catch (e: any) {
    const t1 = performance.now();
    return { ok: false as const, error: e?.name === "AbortError" ? "TIMEOUT" : (e?.message || "NETWORK_ERROR"), durationMs: Math.round(t1 - t0) };
  } finally {
    clearTimeout(id);
  }
}

async function runOnce(check: Check) {
  const res = await fetchWithTimeout(check.url, { method: check.method || "GET", timeoutMs: toMs(check.timeoutSec, 10), headers: check.headers || {} });
  if (!('ok' in res) || !res.ok) return { ok: false, reason: (res as any).error, status: 0, durationMs: (res as any).durationMs, urlFinal: check.url };
  const status = (res as any).status;
  if (typeof check.expectStatus === "number" && status !== check.expectStatus) return { ok: false, reason: `HTTP ${status} (expected ${check.expectStatus})`, status, durationMs: (res as any).durationMs, urlFinal: (res as any).urlFinal, headers: (res as any).headers, body: (res as any).body };
  if (Array.isArray(check.expectStatusIn) && !check.expectStatusIn.includes(status)) return { ok: false, reason: `HTTP ${status} (expected one of: ${check.expectStatusIn.join(", ")})`, status, durationMs: (res as any).durationMs, urlFinal: (res as any).urlFinal, headers: (res as any).headers, body: (res as any).body };
  if (typeof check.expectStatusLt === "number" && !(status < check.expectStatusLt)) return { ok: false, reason: `HTTP ${status} (expected < ${check.expectStatusLt})`, status, durationMs: (res as any).durationMs, urlFinal: (res as any).urlFinal, headers: (res as any).headers, body: (res as any).body };
  if (check.mustContain && !(res as any).body.includes(check.mustContain)) return { ok: false, reason: `Body missing "${check.mustContain}"`, status, durationMs: (res as any).durationMs, urlFinal: (res as any).urlFinal, headers: (res as any).headers, body: (res as any).body };
  return { ok: true, status, durationMs: (res as any).durationMs, urlFinal: (res as any).urlFinal, headers: (res as any).headers, body: (res as any).body };
}

async function runWithRetries(check: Check) {
  const tries = Math.max(0, Number(check.retries ?? 0)) + 1;
  let last: any = null;
  for (let i = 0; i < tries; i++) {
    last = await runOnce(check);
    if (last.ok) return last;
    if (i < tries - 1) await sleep(500 * (i + 1));
  }
  return last;
}

export async function checkAll(apps: AppChecks[], poolSize = 8): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const tasks: (() => Promise<void>)[] = [];

  for (const app of apps) {
    for (const check of app.checks) {
      tasks.push(async () => {
        const r = await runWithRetries(check);
        results.push({ app: app.app, name: check.name, url: check.url, ok: !!r.ok, status: r.status, reason: r.reason, durationMs: r.durationMs, urlFinal: r.urlFinal, headers: r.headers, bodySnippet: (r.body ? r.body.slice(0, 200) : undefined) });
      });
    }
  }

  const running: Promise<void>[] = [];
  for (const t of tasks) {
    const p = t().finally(() => { const i = running.indexOf(p); if (i >= 0) running.splice(i, 1); });
    running.push(p);
    if (running.length >= poolSize) await Promise.race(running);
  }
  await Promise.allSettled(running);
  return results;
}

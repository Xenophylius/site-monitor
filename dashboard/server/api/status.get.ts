import type { H3Event } from 'h3';
import type { AppChecks } from '~/lib/check';
import { checkAll } from '~/lib/check';

export default defineEventHandler(async (_event: H3Event) => {
  const configUrl = useRuntimeConfig().SITES_CONFIG_URL as string | undefined;
  const ghToken = process.env.GITHUB_TOKEN; // injecté par Vercel

  let apps: AppChecks[] | null = null;

  if (configUrl) {
    try {
      if (configUrl.startsWith('https://api.github.com/')) {
        // Repo privé via API GitHub
        const r = await fetch(configUrl, {
          cache: 'no-store',
          headers: ghToken ? { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github.v3+json' } : {}
        });
        if (!r.ok) throw new Error(`GitHub API HTTP ${r.status}`);
        const json: any = await r.json();
        if (json && json.content) {
          const decoded = Buffer.from(json.content, 'base64').toString('utf8');
          apps = JSON.parse(decoded);
        } else {
          apps = Array.isArray(json) ? json : null;
        }
      } else {
        // URL publique (RAW)
        const r = await fetch(configUrl, { cache: 'no-store' });
        if (!r.ok) throw new Error(`Config HTTP ${r.status}`);
        apps = await r.json();
      }
    } catch (e) {
      console.warn('Remote config load failed:', e);
    }
  }

  if (!apps) {
    // fallback local si jamais tu crées dashboard/config/sites.json
    apps = (await import('~/config/sites.json').catch(() => ({ default: [] as AppChecks[] }))).default as AppChecks[];
  }

  const results = await checkAll(apps);
  return {
    timestamp: new Date().toISOString(),
    total: results.length,
    ok: results.filter(r => r.ok).length,
    ko: results.filter(r => !r.ok).length,
    results
  };
});

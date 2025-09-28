<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

type Result = { app:string; name:string; url:string; ok:boolean; status?:number; reason?:string; durationMs:number; urlFinal?:string; headers?:Record<string,string>; bodySnippet?:string; };
type ApiResponse = { timestamp:string; total:number; ok:number; ko:number; results:Result[]; };

const data = ref<ApiResponse|null>(null);
const loading = ref(false);
const error = ref<string|null>(null);

async function load() {
  try {
    loading.value = true; error.value = null;
    const r = await fetch('/api/status', { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    data.value = await r.json();
  } catch (e:any) {
    error.value = e?.message || 'Erreur';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  load();
  const id = setInterval(load, 60000);
  onUnmounted(() => clearInterval(id));
});
</script>

<template>
  <div class="container">
    <header style="margin-bottom:16px">
      <h1 style="font-size:20px; font-weight:600;">Status Dashboard</h1>
      <p class="small">Rafraîchit automatiquement toutes les 60 secondes.</p>
    </header>

    <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
      <button class="btn" :disabled="loading" @click="load">{{ loading ? 'Chargement...' : 'Rafraîchir' }}</button>
      <span v-if="data" class="small">
        Dernière mise à jour : {{ new Date(data.timestamp).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) }}
        — Total: {{ data.total }}, OK: {{ data.ok }}, KO: {{ data.ko }}
      </span>
      <span v-if="error" class="small" style="color:#b91c1c">Erreur: {{ error }}</span>
    </div>

    <div class="card">
      <table class="table">
        <thead>
          <tr>
            <th>App</th>
            <th>Check</th>
            <th>Statut</th>
            <th>HTTP</th>
            <th>Latence</th>
            <th>URL</th>
            <th>Détails</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, idx) in data?.results || []" :key="idx">
            <td>{{ r.app }}</td>
            <td>{{ r.name }}</td>
            <td>
              <span class="badge" :class="r.ok ? 'up' : 'down'">
                <span class="dot" :class="r.ok ? 'up' : 'down'"></span>
                {{ r.ok ? 'UP' : 'DOWN' }}
              </span>
            </td>
            <td>{{ r.status ?? '—' }}</td>
            <td>{{ r.durationMs }} ms</td>
            <td>
              <a :href="r.urlFinal || r.url" target="_blank" rel="noreferrer">{{ r.url }}</a>
            </td>
            <td class="small">
              <template v-if="r.ok">
                OK
              </template>
              <template v-else>
                <div><strong>Cause:</strong> {{ r.reason }}</div>
                <pre v-if="r.bodySnippet">{{ r.bodySnippet }}</pre>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

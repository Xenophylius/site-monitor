// nuxt.config.ts
export default defineNuxtConfig({
  compatibilityDate: '2024-12-01',
  devtools: false,
  css: ['~/assets/main.css'],
  nitro: {
    preset: 'vercel'
  },
  app: {
    head: {
      title: 'Status Dashboard',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }]
    }
  },
  runtimeConfig: {
    // côté serveur uniquement
    SITES_CONFIG_URL: process.env.SITES_CONFIG_URL || ''
  }
});

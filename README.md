# Site Monitor (Node.js + GitHub Actions + Telegram)

Surveille plusieurs sites (front et/ou API) toutes les 10 minutes. Envoie **une seule** notification Telegram **uniquement s'il y a au moins un échec**, avec un maximum d'infos (status, cause, latence, URL finale, extrait body, headers).

## ⚙️ Configuration

1. Édite `config/sites.json` pour déclarer tes apps et checks. Options par check :
   - `url` (obligatoire), `name` (libre)
   - `method` (`GET` ou `HEAD`)
   - `timeoutSec` (par tentative)
   - `retries` (nombre de retentatives)
   - `expectStatus` (code exact attendu) **ou** `expectStatusIn` (liste de codes acceptés, ex: `[200, 401]`) **ou** `expectStatusLt` (ex: 400)
   - `mustContain` (chaîne devant apparaître dans le body)
   - `headers` (objet, ex: `{ "Authorization": "Bearer xxx" }`)

2. Crée un bot Telegram via **@BotFather** et récupère le **TOKEN**.
3. Trouve ton **chat_id** (perso ou groupe) :
   - parle à ton bot puis ouvre `https://api.telegram.org/bot<TOKEN>/getUpdates`,
   - ou utilise `@userinfobot`.
4. Dans GitHub → repo **Settings → Secrets and variables → Actions** :
   - `TELEGRAM_TOKEN` = token du bot
   - `TELEGRAM_CHAT_ID` = chat id

## 🧪 Test
- Lancer manuellement la workflow (**Actions → Run workflow**).
- Ou en local : `node scripts/check.js` (définir les variables d'env si tu veux tester Telegram).

## 🚦 État de la job
Par défaut, la job **reste verte** même s'il y a des échecs (pour éviter le spam rouge).  
Si tu préfères faire échouer la run quand un site est down, édite `scripts/check.js` et remplace la ligne :
```js
process.exit(0);
```
par
```js
process.exit(failures.length > 0 ? 1 : 0);
```

## 🧩 Versions
- Node.js 20 sur GitHub Actions
- Aucun package externe requis

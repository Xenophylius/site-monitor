// scripts/telegram.js
export async function sendTelegramMessage({ token, chatId, text }) {
  if (!token || !chatId) {
    console.error("Telegram not configured: missing token/chatId");
    return { ok: false, reason: "missing-config" };
  }
  const endpoint = `https://api.telegram.org/bot${token}/sendMessage`;

  // Telegram max ~4096 chars; keep margin
  const MAX = 3900;
  const chunks = chunkText(text, MAX);

  let last;
  for (const part of chunks) {
    const params = new URLSearchParams({
      chat_id: chatId,
      text: part,
      parse_mode: "HTML",
      disable_web_page_preview: "true"
    });
    const resp = await fetch(endpoint, { method: "POST", body: params });
    const data = await resp.json().catch(() => ({}));
    const ok = resp.ok && data.ok;
    if (!ok) {
      console.error("Telegram error:", data);
      last = { ok: false, data };
      break;
    }
    last = { ok: true, data };
  }
  return last;
}

function chunkText(s, size) {
  const out = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}

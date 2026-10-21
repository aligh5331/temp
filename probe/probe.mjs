// Reachability probe for "Are Bale and t.me reachable from each candidate host today?"
// Runtime-neutral (fetch only): used by the GitHub Actions runner, the Cloudflare Worker
// and the Vercel function. Apps Script has its own port in probe.gs.

const CHANNEL = "telegram";

async function timed(name, fn) {
  const t0 = Date.now();
  try {
    const r = await fn();
    return { name, ms: Date.now() - t0, ...r };
  } catch (e) {
    return { name, ms: Date.now() - t0, status: 0, error: String(e && e.message || e).slice(0, 120) };
  }
}

function withTimeout(ms) {
  return AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined;
}

export async function probe({ BALE_BOT_TOKEN, INBOX_CHAT_ID }, host) {
  const bale = `https://tapi.bale.ai/bot${BALE_BOT_TOKEN}`;
  const results = [];

  results.push(await timed("bale.getMe", async () => {
    const r = await fetch(`${bale}/getMe`, { signal: withTimeout(20000) });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, ok: j.ok === true };
  }));

  let photoUrl = null;
  results.push(await timed("tme.page", async () => {
    const r = await fetch(`https://t.me/s/${CHANNEL}`, { signal: withTimeout(20000) });
    const html = await r.text();
    const posts = (html.match(/data-post="/g) || []).length;
    const m = html.match(/background-image:url\('(https:\/\/cdn\d*\.telesco\.pe\/file\/[^']+)'\)/);
    if (m) photoUrl = m[1];
    return { status: r.status, bytes: html.length, posts, ok: r.status === 200 && posts > 0 };
  }));

  results.push(await timed("tme.cdn", async () => {
    if (!photoUrl) return { status: 0, ok: false, error: "no photo url on page" };
    const r = await fetch(photoUrl, { signal: withTimeout(20000) });
    const buf = await r.arrayBuffer();
    return { status: r.status, bytes: buf.byteLength, ok: r.status === 200 && buf.byteLength > 0 };
  }));

  const summary = results
    .map((x) => `${x.ok ? "✅" : "❌"} ${x.name} ${x.status} ${x.ms}ms${x.error ? " " + x.error : ""}`)
    .join("\n");
  const text = `#relay #probe #${host}\n${new Date().toISOString()}\n${summary}`;

  // sendMessage into the Inbox is itself a probe; its own result is reported in the JSON only.
  results.push(await timed("bale.sendMessage", async () => {
    const r = await fetch(`${bale}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: INBOX_CHAT_ID, text }),
      signal: withTimeout(20000),
    });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, ok: j.ok === true };
  }));

  return { host, at: new Date().toISOString(), results };
}

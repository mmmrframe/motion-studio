// Motion Studio API — Cloudflare Worker
// Маршруты: /yadisk, /upload-url, /submit, /status/:id, /download/:id
// Секреты (wrangler secret put): GITHUB_TOKEN, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
// Переменные (wrangler.toml): REPO, ALLOWED_ORIGIN, R2_ACCOUNT_ID, R2_BUCKET
// Привязки: KV `KEYS` (ключ доступа -> имя заказчика), R2 `BUCKET`
import { AwsClient } from "aws4fetch";

const STATE_BY_LABEL = {
  "status:queued": "queued", "status:working": "working", "status:render": "render",
  "status:question": "working", "status:done": "done", "status:error": "error",
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
      "Access-Control-Allow-Headers": "Content-Type, X-Access-Key",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

    // --- доступ по ключу ---
    const key = req.headers.get("X-Access-Key") || url.searchParams.get("key");
    const customer = key ? await env.KEYS.get(key) : null;
    if (!customer) return json({ error: "Неверный ключ доступа" }, 401);

    const gh = (path, init = {}) => fetch(`https://api.github.com/repos/${env.REPO}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "motion-studio", ...(init.headers || {}) },
    });

    // --- ссылка Яндекс Диска -> прямая ссылка для просмотра в форме ---
    if (url.pathname === "/yadisk") {
      const pk = encodeURIComponent(url.searchParams.get("url") || "");
      const [meta, dl] = await Promise.all([
        fetch(`https://cloud-api.yandex.net/v1/disk/public/resources?public_key=${pk}`).then(r => r.json()),
        fetch(`https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=${pk}`).then(r => r.json()),
      ]);
      if (!dl.href) return json({ error: "Ссылка не открывается — проверьте доступ «Для всех»" }, 400);
      return json({ name: meta.name, href: dl.href, size: meta.size });
    }

    // --- подписанная ссылка для загрузки файла прямо в R2 (минуя лимит тела Worker) ---
    if (url.pathname === "/upload-url" && req.method === "POST") {
      const { name } = await req.json();
      const objKey = `uploads/${crypto.randomUUID()}/${(name || "source.mp4").replace(/[^\w.\-]+/g, "_")}`;
      const r2 = new AwsClient({ accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY, service: "s3", region: "auto" });
      const signed = await r2.sign(
        new Request(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${objKey}?X-Amz-Expires=3600`, { method: "PUT" }),
        { aws: { signQuery: true } },
      );
      return json({ put: signed.url, key: objKey });
    }

    // --- заявка -> issue в GitHub ---
    if (url.pathname === "/submit" && req.method === "POST") {
      const { payload, prompt } = await req.json();
      payload.customer = customer;
      const p = payload;
      const body = [
        `**Заказчик:** ${customer} · ${p.contact}`,
        p.kaiten ? `**Кайтен:** #${p.kaiten}` : "",
        `**Запись:** ${p.source.name} · ${p.source.duration} с ${p.source.url ? "· " + p.source.url : ""}`,
        `**Звук:** ${p.sound.mode}${p.sound.track ? " · " + p.sound.track : ""}`,
        `**Сцена:** ${p.scene}`,
        `**Титры:** ${p.titles.enabled ? p.titles.items.length : "нет"}`,
        p.notes ? `**Пожелания:** ${p.notes}` : "",
        "",
        "<details><summary>Промт для агента</summary>\n\n```text\n" + prompt + "\n```\n</details>",
        "",
        "<!-- request-json -->\n```json\n" + JSON.stringify(p, null, 2) + "\n```",
      ].filter(Boolean).join("\n");
      const r = await gh("/issues", {
        method: "POST",
        body: JSON.stringify({ title: `Скринкаст: ${p.source.name}`, body, labels: ["screencast", "status:queued"] }),
      });
      if (!r.ok) return json({ error: await r.text() }, 502);
      const issue = await r.json();
      await env.KEYS.put(`req:${issue.number}`, key); // заявку видит только её автор
      return json({ id: issue.number, issue_url: issue.html_url });
    }

    // --- статус заявки ---
    const m = url.pathname.match(/^\/(status|download)\/(\d+)$/);
    if (m) {
      const [, action, id] = m;
      if ((await env.KEYS.get(`req:${id}`)) !== key) return json({ error: "Нет доступа к заявке" }, 403);

      if (action === "download") {
        const obj = await env.BUCKET.get(`results/${id}/result.mp4`);
        if (!obj) return json({ error: "Файла пока нет" }, 404);
        return new Response(obj.body, { headers: { ...cors, "Content-Type": "video/mp4", "Content-Disposition": `attachment; filename="screencast_${id}.mp4"` } });
      }

      const issue = await (await gh(`/issues/${id}`)).json();
      const labels = issue.labels.map(l => l.name);
      const state = labels.map(l => STATE_BY_LABEL[l]).find(Boolean) || "queued";
      let question = null;
      if (labels.includes("status:question")) {
        const comments = await (await gh(`/issues/${id}/comments?per_page=100`)).json();
        question = comments.reverse().find(c => c.body.startsWith("❓"))?.body.slice(2).trim() || null;
      }
      return json({
        state, question, issue_url: issue.html_url,
        download_url: state === "done" ? `${url.origin}/download/${id}?key=${encodeURIComponent(key)}` : null,
      });
    }

    return json({ error: "not found" }, 404);
  },
};

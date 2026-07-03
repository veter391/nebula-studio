/**
 * Thin server-side proxy for the AI Assistant's default (no-BYOK) mode.
 *
 * Why this exists: Nebula is otherwise a pure static site with zero
 * backend. A shared OpenRouter key CANNOT be shipped to the browser --
 * anything in client JS is trivially extractable via devtools, no amount
 * of obfuscation changes that. So the shared key lives ONLY as a
 * Cloudflare secret (`wrangler secret put OPENROUTER_KEY`), never in
 * source, never in the deployed bundle, and this Worker is the only thing
 * that ever sees it.
 *
 * Everything that isn't a POST to /api/ai falls straight through to the
 * static asset handler -- this Worker does not touch the rest of the app.
 *
 * @module worker
 */

const FREE_MODEL_CHAIN = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'openai/gpt-oss-120b:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'nvidia/nemotron-nano-9b-v2:free',
  'liquid/lfm-2.5-1.2b-instruct:free',
];

// Cloudflare's native rate-limit binding only supports 10s/60s windows
// (burst protection), not a real "N per hour" quota -- see wrangler.toml.
const RATE_LIMIT_WINDOW_LABEL = '6 requests per 60s per visitor';
const REQUEST_TIMEOUT_MS = 25000;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/ai' && request.method === 'POST') {
      return handleAIProxy(request, env);
    }

    // Everything else: serve the static site as normal.
    return env.ASSETS.fetch(request);
  },
};

async function handleAIProxy(request, env) {
  if (!env.OPENROUTER_KEY) {
    return json({ ok: false, error: 'Shared AI is not configured on this deployment.' }, 503);
  }

  // Fair-use limit so one visitor can't burn the whole shared free-tier
  // quota for everyone else. Best-effort (Workers Rate Limiting binding),
  // not a hard security boundary -- there is nothing sensitive to protect
  // beyond quota fairness, since this only ever calls free models.
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (env.AI_RATE_LIMITER) {
    const { success } = await env.AI_RATE_LIMITER.limit({ key: ip });
    if (!success) {
      return json(
        {
          ok: false,
          error: `Shared AI is rate-limited (${RATE_LIMIT_WINDOW_LABEL}). Wait a moment, or add your own OpenRouter key in Settings to skip this limit.`,
          isRateLimited: true,
        },
        429
      );
    }
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid request body.' }, 400);
  }

  const messages = Array.isArray(body?.messages) ? body.messages : null;
  if (!messages || messages.length === 0) {
    return json({ ok: false, error: 'messages array is required.' }, 400);
  }
  // Cap prompt size server-side too -- defense in depth, don't just trust
  // the client to have already truncated the user's input.
  const totalChars = messages.reduce((n, m) => n + String(m?.content || '').length, 0);
  if (totalChars > 4000) {
    return json({ ok: false, error: 'Prompt too long.' }, 400);
  }

  let lastError = 'Unknown error';
  for (const model of FREE_MODEL_CHAIN) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://nebula-studio.workers.dev',
          'X-Title': 'Nebula Studio (shared)',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: body.temperature ?? 0.6,
          max_tokens: Math.min(body.maxTokens ?? 300, 700),
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      const upstream = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastError = upstream?.error?.message || `HTTP ${res.status}`;
        continue; // try the next model in the chain
      }
      const content = upstream?.choices?.[0]?.message?.content;
      if (!content) {
        lastError = 'Empty completion';
        continue;
      }
      return json({ ok: true, content, model });
    } catch (e) {
      clearTimeout(timer);
      lastError = e.name === 'AbortError' ? `${model} timed out` : e.message;
    }
  }

  return json({ ok: false, error: `All shared models failed. Last error: ${lastError}` }, 502);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

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
 * MODEL SELECTION is dynamic, not a hardcoded list -- see pickFreeModels()
 * below. A hardcoded model ID is a real, observed failure mode: OpenRouter's
 * free-tier catalog changes (models get added, retired, or stop being
 * free) independently of this codebase. Instead this fetches the live
 * catalog from OpenRouter, ranks free text models by size, and falls back
 * through three layers if that fetch itself fails -- see the docstring on
 * pickFreeModels for the exact fallback order.
 *
 * @module worker
 */

// Capable GENERAL instruct models tried FIRST (in this order) when still
// free. Ordered by capability-per-latency for the assistant's job (map a
// vibe to genre + tempo + groove + energy): large general models lead for
// quality, smaller ones follow as fast fallbacks. Deliberately NOT ordered
// purely by raw size -- the very biggest free models are either narrow
// coding models or reasoning models that take 20-30s without producing a
// better answer for this task. Any that lose free status are skipped and
// the ranked tail (from the live catalog) covers the rest.
const PREFERRED_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'openai/gpt-oss-120b:free',
  'openai/gpt-oss-20b:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-nano-9b-v2:free',
];

// Absolute last resort ONLY -- used if OpenRouter's /models endpoint is
// unreachable AND there's no cached catalog at all yet (i.e. this Worker
// isolate has never successfully fetched the live list). Kept short and
// only as a final safety net, not the primary source of truth.
const HARDCODED_FALLBACK = ['meta-llama/llama-3.3-70b-instruct:free', 'nvidia/nemotron-nano-9b-v2:free'];

const CATALOG_CACHE_TTL_SECONDS = 3600; // 1h -- free-tier catalog doesn't change minute to minute
// Cache key only (never fetched). Bump the suffix whenever the ranking
// logic changes so a stale cached ordering doesn't linger for up to an hour.
const CATALOG_CACHE_URL = 'https://nebula-studio.internal/free-model-catalog-v4-capable-first';

// Cloudflare's native rate-limit binding only supports 10s/60s windows
// (burst protection), not a real "N per hour" quota -- see wrangler.toml.
const RATE_LIMIT_WINDOW_LABEL = '6 requests per 60s per visitor';
// Per-model timeout: generous enough to let a capable model finish composing
// a full 16-step grid (quality is worth the wait) without a stuck/queued one
// dragging on forever.
const REQUEST_TIMEOUT_MS = 22000;
// Overall wall-clock cap across ALL model attempts. Past this, give up and
// let the client fall back to an instant deterministic roll instead of
// stacking timeout after timeout. Kept a bit above one full per-model
// timeout so a slow-but-working model still gets a real chance to finish.
const OVERALL_BUDGET_MS = 40000;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/ai' && request.method === 'POST') {
      return handleAIProxy(request, env, ctx);
    }

    // Everything else: serve the static site as normal.
    return env.ASSETS.fetch(request);
  },
};

/**
 * Fetch and rank the current free-tier text models from OpenRouter's own
 * catalog, cached via the Workers Cache API for an hour so we don't hit
 * /models on every chat request. Three-layer fallback:
 *
 *   1. Fresh live fetch (or a cache hit within the TTL) -- the normal path.
 *   2. A stale cached catalog, if the live fetch fails but we have *any*
 *      previously-cached result (better an hour-old real list than nothing).
 *   3. HARDCODED_FALLBACK, only if neither of the above ever worked.
 *
 * Ranking: parses an approximate parameter count ("405B", "70B", "1.2B"...)
 * out of the model's name/description -- OpenRouter doesn't expose a clean
 * numeric field for this -- and sorts biggest first, tie-broken by context
 * length. This is a heuristic, not a guarantee of quality; the actual
 * safety net is that every model response still goes through the same
 * strict JSON/genre validation as before, so a poorly-ranked model just
 * costs a wasted round-trip before the next one in the chain, never a
 * wrong result reaching the audio engine.
 */
async function pickFreeModels(env, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(CATALOG_CACHE_URL);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch('https://openrouter.ai/api/v1/models', { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      const ranked = rankFreeModels(data.data || []);
      if (ranked.length > 0) {
        const cacheResponse = new Response(JSON.stringify(ranked), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${CATALOG_CACHE_TTL_SECONDS}` },
        });
        ctx.waitUntil(cache.put(cacheKey, cacheResponse));
        return ranked;
      }
    }
  } catch {
    // fall through to cache / hardcoded fallback below
  }

  const cached = await cache.match(cacheKey);
  if (cached) {
    const stale = await cached.json().catch(() => null);
    if (Array.isArray(stale) && stale.length > 0) return stale;
  }

  return HARDCODED_FALLBACK;
}

/**
 * Extract text-capable free models and rank them. Non-reasoning ("instruct")
 * models are preferred FIRST, then by approximate size. This is a deliberate
 * UX call: the assistant's job (map a vibe to a genre + seed) is trivial and
 * doesn't need chain-of-thought, but reasoning models spend 8-20s "thinking"
 * before answering, which feels like a hang. A fast 70B instruct model does
 * this in ~2s and just as correctly. Big reasoning models stay in the chain
 * as a fallback, just not in front of every request.
 */
function rankFreeModels(models) {
  const ranked = models
    .filter((m) => m.id?.endsWith(':free'))
    .filter((m) => m.architecture?.modality === 'text->text' || m.architecture?.input_modalities?.includes('text'))
    .map((m) => ({
      id: m.id,
      // Narrow coding models and always-on reasoning models go to the back:
      // neither improves genre/tempo/energy picking, and reasoning models are
      // slow. General models by size come first.
      coding: /code|coder/i.test(m.id) ? 1 : 0,
      reasoning: m.reasoning?.default_enabled ? 1 : 0,
      size: parseParamCount(m.name, m.description),
      ctx: m.context_length || 0,
    }))
    .sort((a, b) => a.coding - b.coding || a.reasoning - b.reasoning || b.size - a.size || b.ctx - a.ctx)
    .map((m) => m.id);

  // Curated capable models first (if still free), then the ranked tail.
  const available = new Set(ranked);
  const front = PREFERRED_MODELS.filter((id) => available.has(id));
  const frontSet = new Set(front);
  return [...front, ...ranked.filter((id) => !frontSet.has(id))];
}

/** Best-effort "how many billions of parameters" guess from free-text model metadata. */
function parseParamCount(name = '', description = '') {
  const text = `${name} ${description}`;
  const matches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*B\b/gi)];
  if (matches.length === 0) return 0;
  return Math.max(...matches.map((m) => parseFloat(m[1])));
}

async function handleAIProxy(request, env, ctx) {
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

  const models = shufflePreferred(await pickFreeModels(env, ctx));
  let lastError = 'Unknown error';
  const deadline = Date.now() + OVERALL_BUDGET_MS;
  for (const model of models) {
    // Overall wall-clock cap across all model attempts: if the fast models
    // are all rate-limited and we're only left with slow ones, stop here
    // rather than making the user wait 40s+. The client then instantly
    // rolls a deterministic pattern, so they still get a beat right away.
    if (Date.now() > deadline) {
      lastError = 'No model responded within the time budget';
      break;
    }
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
          // Large budget: the assistant now returns a full 16-step pattern
          // (up to 12 tracks x 16 numbers) plus a reasoning model's thinking
          // tokens, all of which count here -- too small truncates the JSON
          // mid-grid. Do NOT send reasoning:{enabled:false} -- it 400s on
          // reasoning-mandatory endpoints (gpt-oss) and knocks fast models
          // out of the pool. Truncation is caught by the JSON check below.
          max_tokens: Math.min(body.maxTokens ?? 1600, 2000),
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
      // The caller always wants JSON — validate it actually parses before
      // returning. A truncated / non-JSON answer (some free models ignore
      // response_format, or run out of tokens mid-object) is treated as a
      // failure so we fall through to the next model instead of handing the
      // browser a broken string it can't use.
      if (!isValidJsonObject(content)) {
        lastError = `${model} returned non-JSON / truncated output`;
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

/**
 * Randomize the order of the capable (preferred) models per request so that
 * when several are available you get compositional variety -- different
 * models have different "handwriting" for a groove -- instead of always
 * hitting the same one. The non-preferred ranked tail stays in place as the
 * deterministic fallback order. (When the top models are rate-limited, the
 * chain still walks down to whatever responds, as before.)
 */
function shufflePreferred(models) {
  const front = models.filter((id) => PREFERRED_MODELS.includes(id));
  const tail = models.filter((id) => !PREFERRED_MODELS.includes(id));
  for (let i = front.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [front[i], front[j]] = [front[j], front[i]];
  }
  return [...front, ...tail];
}

/** True if `text` contains a parseable JSON object (tolerating prose around it). */
function isValidJsonObject(text) {
  const match = String(text).match(/\{[\s\S]*\}/);
  if (!match) return false;
  try {
    const parsed = JSON.parse(match[0]);
    return parsed && typeof parsed === 'object';
  } catch {
    return false;
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

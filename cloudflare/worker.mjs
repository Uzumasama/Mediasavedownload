// MediaSaveDownload - Cloudflare Worker API (routes /api/*).
// Keeps the SaveAPI key server-side, resolves supported public video links,
// normalizes the response, and serves signed download links.
//
// Cloudflare Worker secret/variables:
//   SAVEAPI_KEY       required secret from SaveAPI
//   MAX_PROXY_BYTES   optional, defaults to 19,500,000 bytes

const PLATFORM_HOSTS = {
  TikTok: ['tiktok.com'],
  Instagram: ['instagram.com', 'instagr.am'],
  Facebook: ['facebook.com', 'fb.watch', 'fb.com'],
  YouTube: ['youtube.com', 'youtu.be'],
  Pinterest: ['pinterest.com', 'pin.it'],
};

const IMG_EXT = /\.(jpe?g|png|webp|gif|heic|avif)(\?|#|$)/i;
const VID_EXT = /\.(mp4|mov|webm|m4v|mkv)(\?|#|$)/i;
const AUD_EXT = /\.(mp3|m4a|aac|wav|ogg)(\?|#|$)/i;

const enc = new TextEncoder();

export default {
  async fetch(request, env) {
  const url = new URL(request.url);
  try {
    if (url.pathname === '/api/health') return health(env);
    if (url.pathname === '/api/download') return await handleDownload(url, env);
    if (url.pathname === '/api/file') return await handleFile(url, env);
    if (env.ASSETS) return env.ASSETS.fetch(request);
  } catch (err) {
    return json({ error: 'server_error', message: 'Something went wrong on the server. Please try again shortly.' }, 500);
  }
  return json({ error: 'not_found' }, 404);
  },
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function health(env) {
  return json({ ok: true, configured: Boolean(env.SAVEAPI_KEY), provider: 'saveapi' });
}

function detectPlatform(hostname) {
  const h = hostname.toLowerCase();
  for (const [name, hosts] of Object.entries(PLATFORM_HOSTS)) {
    if (hosts.some((d) => h === d || h.endsWith('.' + d))) return name;
  }
  return null;
}

function isSupportedVideoUrl(platform, u) {
  const path = u.pathname.toLowerCase();
  switch (platform) {
    case 'TikTok':
      return /\/video\/\d+/.test(path) || /^(vm|vt)\.tiktok\.com$/.test(u.hostname.toLowerCase());
    case 'Instagram':
      return /^\/(reel|reels)\//.test(path);
    case 'Facebook':
      return /^\/reel\//.test(path) || /^\/share\/r\//.test(path) || u.hostname.toLowerCase() === 'fb.watch';
    case 'YouTube':
      return /^\/shorts\//.test(path) || u.hostname.toLowerCase() === 'youtu.be';
    case 'Pinterest':
      return /^\/pin\/\d+/.test(path) || u.hostname.toLowerCase() === 'pin.it';
    default:
      return false;
  }
}

// Accept only direct supported video post URLs; photo links and profile pages are not supported.
function isProfileLink(platform, u) {
  const segs = u.pathname.split('/').filter(Boolean);
  const first = segs[0] || '';
  switch (platform) {
    case 'TikTok':
      return first.startsWith('@') && !segs.includes('video') && !segs.includes('photo');
    case 'Instagram':
      return segs.length === 0 || (segs.length === 1 && !['p', 'reel', 'reels', 'tv', 'stories'].includes(first));
    case 'YouTube':
      return first.startsWith('@') || ['channel', 'c', 'user'].includes(first);
    default:
      return false;
  }
}

async function handleDownload(url, env) {
  if (!env.SAVEAPI_KEY) {
    return json({
      error: 'not_configured',
      message: 'The video service is not available yet. Please try again later.',
    }, 503);
  }
  const target = (url.searchParams.get('url') || '').trim();
  let parsed;
  try {
    parsed = new URL(target);
    if (!/^https?:$/.test(parsed.protocol) || target.length > 2000) throw new Error('bad');
  } catch {
    return json({ error: 'bad_url', message: 'Invalid link. Paste a complete URL beginning with https://' }, 400);
  }
  const platform = detectPlatform(parsed.hostname);
  if (!platform) {
    return json({ error: 'unsupported', message: 'Unsupported platform. Use TikTok, Instagram Reels, Facebook Reels, YouTube Shorts, or Pinterest video links.' }, 400);
  }
  if (!isSupportedVideoUrl(platform, parsed)) {
    return json({ error: 'unsupported_video_url', message: 'Please paste a supported video post URL: TikTok video, Instagram Reel, Facebook Reel, YouTube Short, or Pinterest video Pin.' }, 400);
  }
  if (isProfileLink(platform, parsed)) {
    return json({ error: 'profile_not_supported', message: 'This looks like a profile link. Paste a direct video post URL instead.' }, 422);
  }

  const api = new URL('https://api.saveapi.org/v1/download');
  api.searchParams.set('url', parsed.href);

  let res;
  try {
    res = await fetch(api, {
      headers: {
        authorization: `Bearer ${env.SAVEAPI_KEY}`,
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    return json({ error: 'upstream_timeout', message: 'SaveAPI did not respond. Please try again shortly.' }, 504);
  }

  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* bukan JSON */ }

  if (!data || typeof data !== 'object') {
    return json({ error: 'bad_response', message: 'SaveAPI returned an unreadable response.' }, 502);
  }
  const apiErrorCode = data.error && data.error.code ? String(data.error.code) : '';
  if (!res.ok || data.success === false) {
    let message = (data.error && data.error.message) || data.message || 'SaveAPI could not process this link.';
    let status = res.ok ? 422 : (res.status >= 500 ? 502 : res.status);
    if (res.status === 401 || apiErrorCode === 'INVALID_API_KEY' || apiErrorCode === 'MISSING_API_KEY') {
      message = 'SaveAPI rejected the API key. Check the SAVEAPI_KEY secret in Cloudflare.';
      status = 502;
    } else if (res.status === 429 || apiErrorCode === 'QUOTA_EXCEEDED' || apiErrorCode === 'RATE_LIMITED') {
      message = apiErrorCode === 'RATE_LIMITED'
        ? 'SaveAPI rate limit reached. Please wait and try again.'
        : 'SaveAPI credits are exhausted or the rate limit was reached. Check your SaveAPI balance.';
      status = 429;
    } else if (apiErrorCode === 'PRIVATE_CONTENT') {
      message = 'This post is private or unavailable. Try a public video link.';
      status = 422;
    } else if (apiErrorCode === 'UNSUPPORTED_PLATFORM') {
      message = 'This link is not supported by SaveAPI.';
      status = 400;
    }
    return json({ error: (apiErrorCode || 'upstream_error').toLowerCase(), message: String(message).slice(0, 300) }, status);
  }

  const result = normalize(data);
  result.items = result.items.filter((item) => item.type === 'video');
  if (!result.items.length) {
    return json({ error: 'no_video', message: 'No supported video was found. Make sure the post is public and contains a supported video.' }, 422);
  }

  const secret = env.SAVEAPI_KEY;
  const expires = Date.now() + 60 * 60 * 1000;
  const items = [];
  let n = 0;
  for (const it of result.items) {
    n += 1;
    const ext = guessExt(it);
    const name = `${platform}_${slug(result.title) || 'media'}_${n}.${ext}`;
    const sig = await hmac(secret, `${it.url}\n${name}\n${expires}`);
    const file = `/api/file?u=${encodeURIComponent(it.url)}&n=${encodeURIComponent(name)}&e=${expires}&s=${sig}`;
    items.push({
      type: it.type,
      quality: it.quality,
      watermark: it.watermark,
      ext,
      name,
      thumb: it.type === 'image' ? it.url : result.thumb,
      file,
    });
  }
  return json({ platform, title: result.title, author: result.author, items });
}

async function handleFile(url, env) {
  if (!env.SAVEAPI_KEY) return json({ error: 'not_configured' }, 503);
  const target = url.searchParams.get('u') || '';
  const name = (url.searchParams.get('n') || 'media').replace(/[^\w.\-]+/g, '_').slice(0, 120);
  const expires = Number(url.searchParams.get('e') || 0);
  const sig = url.searchParams.get('s') || '';

  const expected = await hmac(env.SAVEAPI_KEY, `${target}\n${url.searchParams.get('n')}\n${expires}`);
  if (!safeEqual(sig, expected)) return json({ error: 'forbidden', message: 'Tautan unduhan tidak valid.' }, 403);
  if (!expires || Date.now() > expires) return json({ error: 'expired', message: 'Tautan unduhan kedaluwarsa. Proses link sekali lagi.' }, 410);

  let src;
  try {
    src = new URL(target);
    if ((src.protocol !== 'https:' && src.protocol !== 'http:') || src.username || src.password || isPrivateHost(src.hostname)) throw new Error('bad');
  } catch {
    return json({ error: 'bad_url' }, 400);
  }
  if (isPrivateHost(src.hostname)) return json({ error: 'forbidden' }, 403);

  let up;
  try {
    up = await fetchSafeMedia(src.href);
  } catch {
    return json({ error: 'upstream_error', message: 'Gagal mengambil file.' }, 502);
  }
  if (!up.ok || !up.body) return json({ error: 'upstream_error', message: `File tidak bisa diambil (kode ${up.status}).` }, 502);

  const size = Number(up.headers.get('content-length') || 0);
  if (size > Number(env.MAX_PROXY_BYTES || 19500000)) {
    // Terlalu besar untuk diteruskan lewat Netlify (batas 20 MB): buka langsung dari sumbernya.
    try { await up.body.cancel(); } catch { /* abaikan */ }
    return new Response(null, { status: 302, headers: { location: src.href, 'cache-control': 'no-store' } });
  }

  const headers = new Headers();
  headers.set('content-type', up.headers.get('content-type') || 'application/octet-stream');
  const len = up.headers.get('content-length');
  if (len) headers.set('content-length', len);
  headers.set('content-disposition', `attachment; filename="${name}"`);
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(up.body, { status: 200, headers });
}

// ---------- merapikan balasan API ----------

function normalize(data) {
  const roots = [data, data.meta, data.data, data.data && data.data.meta, data.result, data.response, data.results].filter((x) => x && typeof x === 'object' && !Array.isArray(x));
  const pick = (keys) => {
    for (const r of roots) for (const k of keys) if (typeof r[k] === 'string' && r[k].trim()) return r[k].trim();
    return '';
  };
  const title = pick(['title', 'desc', 'caption', 'description', 'text', 'name']).slice(0, 200);

  let author = '';
  for (const r of roots) {
    const a = r.author || r.user || r.owner;
    if (typeof a === 'string') { author = a; break; }
    if (a && typeof a === 'object') {
      author = a.nickname || a.name || a.unique_id || a.username || '';
      if (author) break;
    }
  }

  let thumb = pick(['cover', 'thumbnail', 'thumb', 'origin_cover', 'poster', 'preview']);
  if (!/^https?:/i.test(thumb)) thumb = '';

  const items = [];
  const seen = new Set();

  const addUrl = (u, path, sib) => {
    const p = path.join('.').toLowerCase();
    const k = (path[path.length - 1] || '').toLowerCase();
    if (!/^https?:\/\//i.test(u) || seen.has(u)) return;
    const hasMediaExt = IMG_EXT.test(u) || VID_EXT.test(u);
    if (/(cover|thumb|poster|preview|avatar|profile|icon|dynamic)/.test(k)) {
      if (!thumb && /(cover|thumb|poster|preview)/.test(k)) thumb = u;
      return;
    }
    if (/(music|audio|sound|avatar|author|user)/.test(p)) return;
    if (!hasMediaExt && /(share|web_?url|webpage|permalink|embed|original_url|source_url|page_url)/.test(k)) return;
    if (!hasMediaExt && !/(url|download|play|video|image|img|photo|pic|link|src|nowm|hd|sd|wm|media|file)/.test(k)) return;

    const sibType = String(sib.type || sib.media_type || sib.mediaType || '').toLowerCase();
    const ext = String(sib.extension || sib.ext || '').toLowerCase();
    if (sibType.includes('audio') || AUD_EXT.test(u) || ['mp3', 'm4a', 'aac'].includes(ext)) return;

    let type;
    if (VID_EXT.test(u) || sibType.includes('video') || ['mp4', 'mov', 'webm'].includes(ext)) type = 'video';
    else if (IMG_EXT.test(u) || sibType.includes('image') || sibType.includes('photo') || ['jpg', 'jpeg', 'png', 'webp'].includes(ext) || /(image|img|photo|pic)/.test(p)) type = 'image';
    else type = 'video';

    const isWm = (/(^|[^a-z])(wm|watermark)|wmplay|with_?watermark/.test(k) && !/(no_?wm|nowm|without|no_?watermark)/.test(k)) ||
      sib.watermark === true ||
      (/watermark/i.test(String(sib.quality || sib.label || '')) && !/(no|without)/i.test(String(sib.quality || sib.label || '')));

    let quality = String(sib.quality || sib.resolution || sib.label || '').slice(0, 20);
    quality = quality.replace(/[_\- ]?(no[_\- ]?|without[_\- ]?)?water[_\- ]?mark/ig, '').replace(/[_\-]+/g, ' ').trim();
    if (/^hd$/i.test(quality)) quality = 'HD';
    if (!quality && /hd/.test(k)) quality = 'HD';

    seen.add(u);
    items.push({ type, url: u, quality, watermark: Boolean(isWm) });
  };

  const walk = (node, path, depth) => {
    if (depth > 6 || items.length >= 50) return;
    if (Array.isArray(node)) {
      node.forEach((el) => {
        if (typeof el === 'string') addUrl(el, path, {});
        else walk(el, path, depth + 1);
      });
      return;
    }
    if (!node || typeof node !== 'object') return;
    const direct = node.url || node.download_url || node.downloadUrl || node.link || node.src || node.video_url || node.image_url;
    if (typeof direct === 'string' && /^https?:\/\//i.test(direct)) {
      const key = node.url ? 'url' : node.download_url ? 'download_url' : node.downloadUrl ? 'downloadUrl' : node.link ? 'link' : node.src ? 'src' : node.video_url ? 'video_url' : 'image_url';
      addUrl(direct, path.concat(key), node);
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'string') addUrl(v, path.concat(k), {});
      else if (v && typeof v === 'object') walk(v, path.concat(k), depth + 1);
    }
  };
  walk(data, [], 0);

  items.sort((a, b) => Number(a.watermark) - Number(b.watermark) || Number(/hd|1080|720/i.test(b.quality)) - Number(/hd|1080|720/i.test(a.quality)));
  return { title, author: String(author).slice(0, 80), thumb, items };
}

function guessExt(it) {
  const m = it.url.match(/\.(jpe?g|png|webp|gif|mp4|mov|webm|m4v)(\?|#|$)/i);
  if (m) return m[1].toLowerCase().replace('jpeg', 'jpg');
  return it.type === 'image' ? 'jpg' : 'mp4';
}

function slug(s) {
  return String(s || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

// ---------- keamanan ----------

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function fetchSafeMedia(initialUrl) {
  let current = new URL(initialUrl);
  const headers = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' };
  for (let i = 0; i < 6; i++) {
    if (!['https:', 'http:'].includes(current.protocol) || current.username || current.password || isPrivateHost(current.hostname)) {
      throw new Error('Blocked unsafe media URL');
    }
    const response = await fetch(current.href, { headers, redirect: 'manual', signal: AbortSignal.timeout(25000) });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    if (!location) return response;
    try { await response.body?.cancel(); } catch {}
    current = new URL(location, current);
  }
  throw new Error('Too many media redirects');
}

function isPrivateHost(h) {
  h = h.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return true;
  if (h.includes(':')) return true;
  return false;
}

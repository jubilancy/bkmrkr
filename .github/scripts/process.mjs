// .github/scripts/process.mjs
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ── Taxonomy ──────────────────────────────────────────────────────────────────
const TAXONOMY = [
  ['javascript',   ['javascript','typescript','node','npm','deno','bun','react','vue','svelte','nextjs','vite','webpack','eslint']],
  ['python',       ['python','django','flask','fastapi','pandas','numpy','pytorch','tensorflow','pip','jupyter']],
  ['css',          ['css','sass','scss','tailwind','stylesheet','flexbox','grid','animation','keyframe','postcss']],
  ['web-dev',      ['html','frontend','backend','fullstack','api','rest','graphql','websocket','browser','dom','spa','pwa']],
  ['devtools',     ['cli','terminal','shell','bash','zsh','git','github','vscode','vim','neovim','dotfiles','homebrew']],
  ['database',     ['database','sql','postgres','mysql','sqlite','mongodb','redis','supabase','prisma','orm','query']],
  ['cloud',        ['aws','gcp','azure','cloudflare','vercel','netlify','docker','kubernetes','serverless','deploy','hosting','ci/cd']],
  ['ai',           ['ai','llm','gpt','claude','gemini','openai','anthropic','machine learning','neural','diffusion','embedding','rag','vector','prompt']],
  ['security',     ['security','auth','oauth','jwt','encryption','vulnerability','privacy','tls','ssl','zero trust','infosec']],
  ['open-source',  ['open source','open-source','oss','contributing','license','mit license','apache']],
  ['design',       ['design','ux','ui','figma','sketch','wireframe','prototype','usability','accessibility','a11y','heuristic']],
  ['typography',   ['font','typeface','typography','serif','sans-serif','monospace','variable font','type design','kerning','lettering']],
  ['illustration', ['illustration','drawing','procreate','vector','inkscape','sketch','comic','concept art']],
  ['photography',  ['photo','photography','camera','lightroom','raw','lens','exposure','film photography']],
  ['video',        ['video','film','cinema','motion','premiere','davinci','after effects','ffmpeg','codec','streaming']],
  ['article',      ['blog','post','article','essay','write-up','newsletter','substack','medium','opinion']],
  ['tutorial',     ['tutorial','guide','how to','howto','step by step','learn','beginner','course','walkthrough']],
  ['book',         ['book','ebook','reading','literature','novel','nonfiction','isbn','goodreads','audiobook','chapter']],
  ['research',     ['paper','research','study','arxiv','doi','academic','journal','findings','experiment','dataset']],
  ['productivity', ['productivity','workflow','automation','notion','obsidian','logseq','roam','pkm','gtd','pomodoro','second brain']],
  ['tool',         ['tool','utility','app','software','extension','plugin','addon','widget','generator','converter']],
  ['template',     ['template','starter','boilerplate','scaffold','kit','theme','example']],
  ['music',        ['music','audio','spotify','bandcamp','soundcloud','album','track','playlist','producer','daw','ableton','synth']],
  ['gaming',       ['game','gaming','steam','indie','unity','unreal','pixel art','rpg','fps','nintendo','playstation']],
  ['science',      ['science','physics','biology','chemistry','space','nasa','astronomy','mathematics','math','formula']],
  ['health',       ['health','fitness','wellness','mental health','sleep','nutrition','diet','exercise','meditation','therapy']],
  ['finance',      ['finance','money','investing','stocks','crypto','bitcoin','ethereum','budget','economics','startup','venture']],
  ['reference',    ['reference','docs','documentation','spec','standard','mdn','wikipedia','cheatsheet','glossary','rfc']],
  ['social',       ['twitter','mastodon','bluesky','reddit','discord','community','forum','thread','discussion']],
  ['fun',          ['fun','funny','meme','humor','cool','interesting','weird','random','art','creative','inspired']],
  ['shop',         ['shop','store','buy','product','amazon','etsy','ecommerce','sale','deal','price']],
  ['news',         ['news','politics','world','current events','journalism','breaking','report','analysis']],
];

const DOMAIN_TAGS = {
  'github.com':         ['open-source','devtools'],
  'stackoverflow.com':  ['reference','web-dev'],
  'youtube.com':        ['video'],
  'youtu.be':           ['video'],
  'medium.com':         ['article'],
  'substack.com':       ['article'],
  'dev.to':             ['article','web-dev'],
  'reddit.com':         ['social'],
  'twitter.com':        ['social'],
  'x.com':              ['social'],
  'bsky.app':           ['social'],
  'arxiv.org':          ['research'],
  'npmjs.com':          ['javascript','open-source'],
  'pypi.org':           ['python','open-source'],
  'figma.com':          ['design'],
  'dribbble.com':       ['design'],
  'behance.net':        ['design'],
  'codepen.io':         ['web-dev','css'],
  'notion.so':          ['productivity'],
  'obsidian.md':        ['productivity'],
  'bandcamp.com':       ['music'],
  'soundcloud.com':     ['music'],
  'open.spotify.com':   ['music'],
  'goodreads.com':      ['book'],
  'amazon.com':         ['shop'],
  'wikipedia.org':      ['reference'],
  'mdn.mozilla.org':    ['reference','web-dev'],
  'docs.anthropic.com': ['ai','reference'],
  'openai.com':         ['ai'],
  'huggingface.co':     ['ai','open-source'],
  'vercel.com':         ['cloud','web-dev'],
  'cloudflare.com':     ['cloud','devtools'],
  'tailwindcss.com':    ['css','web-dev'],
};

function domain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// ── Extract plain URLs from mixed input (markdown, html, plain) ───────────────
function extractUrls(input) {
  const found = new Set();
  // Plain URLs
  const plain = input.match(/https?:\/\/[^\s"'<>\])\s]+/g) || [];
  plain.forEach(u => found.add(u.replace(/[.,;:!?]+$/, '')));
  return [...found];
}

function scoreTags(text) {
  const lower = text.toLowerCase();
  const found = new Set();
  for (const [tag, kws] of TAXONOMY) {
    for (const kw of kws) {
      if (lower.includes(kw)) { found.add(tag); break; }
    }
  }
  return [...found].slice(0, 7);
}

async function fetchMeta(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; bookmark-bot/1.0)', 'Accept': 'text/html' },
      redirect: 'follow',
    });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('html')) return { title: domain(url), description: '', image: '', favicon: '', keywords: '' };
    const html = await res.text();
    const $ = cheerio.load(html);
    const g = (...sels) => { for (const s of sels) { const v = $(s).attr('content') || $(s).text(); if (v && v.trim()) return v.trim(); } return ''; };
    const title       = g('meta[property="og:title"]','meta[name="twitter:title"]','title');
    const description = g('meta[property="og:description"]','meta[name="description"]','meta[name="twitter:description"]');
    const image       = g('meta[property="og:image"]','meta[name="twitter:image"]');
    const keywords    = g('meta[name="keywords"]');
    const faviconRel  = $('link[rel~="icon"]').attr('href') || '/favicon.ico';
    let favicon = '';
    try { favicon = new URL(faviconRel, url).href; } catch {}
    return { title: title.slice(0,200), description: description.slice(0,500), image, favicon, keywords };
  } catch(e) {
    clearTimeout(t);
    return { title: domain(url) || url, description: '', image: '', favicon: '', keywords: '' };
  }
}

async function main() {
  // Accept raw mixed input or JSON array
  let rawInput = process.env.INPUT_URLS || '[]';
  const collection = (process.env.INPUT_COLLECTION || '').trim();

  let urls;
  try {
    // Try JSON array first (sent by the frontend)
    urls = JSON.parse(rawInput);
    if (!Array.isArray(urls)) throw new Error();
  } catch {
    // Fall back to extracting URLs from raw text
    urls = extractUrls(rawInput);
  }

  urls = urls.filter(u => u && typeof u === 'string' && u.startsWith('http'));

  if (!urls.length) { console.log('No URLs found.'); process.exit(0); }

  const bmPath = path.resolve('bookmarks.json');
  let data = { bookmarks: [], meta: { updated: '', count: 0 } };
  if (fs.existsSync(bmPath)) {
    try { data = JSON.parse(fs.readFileSync(bmPath, 'utf8')); } catch {}
  }

  const existing = new Set(data.bookmarks.map(b => b.url));
  const toProcess = [...new Set(urls)].filter(u => !existing.has(u));
  console.log(`${toProcess.length} new / ${urls.length - toProcess.length} duplicate(s) skipped`);

  const results = [];
  for (let i = 0; i < toProcess.length; i += 5) {
    const batch = toProcess.slice(i, i + 5);
    const settled = await Promise.allSettled(batch.map(async url => {
      console.log(`  → ${url}`);
      const meta = await fetchMeta(url);
      const d = domain(url);
      const domainHints = DOMAIN_TAGS[d] || [];
      const textForTags = [meta.title, meta.description, meta.keywords, d, url].join(' ');
      const semantic = scoreTags(textForTags);
      const tags = [...new Set([...domainHints, ...semantic])].slice(0, 8);
      return {
        id:          crypto.randomUUID(),
        url,
        title:       meta.title || d || url,
        description: meta.description,
        image:       meta.image,
        favicon:     meta.favicon,
        domain:      d,
        tags,
        collection:  collection || null,
        added:       new Date().toISOString(),
        pinned:      false,
      };
    }));
    settled.forEach(r => {
      if (r.status === 'fulfilled') results.push(r.value);
      else console.warn('  ✗', r.reason?.message || r.reason);
    });
    if (i + 5 < toProcess.length) await new Promise(r => setTimeout(r, 400));
  }

  data.bookmarks = [...results, ...data.bookmarks];
  data.meta = { updated: new Date().toISOString(), count: data.bookmarks.length };
  fs.writeFileSync(bmPath, JSON.stringify(data, null, 2));
  console.log(`✓ bookmarks.json → ${data.bookmarks.length} total`);
}

main().catch(e => { console.error(e); process.exit(1); });

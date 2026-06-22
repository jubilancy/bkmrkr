// .github/scripts/process.mjs
// Runs inside GitHub Actions — fetches page metadata + assigns semantic tags

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

// ── Taxonomy: keyword → tag ───────────────────────────────────────────────────
// Each entry: [tag, [...keywords that trigger it]]
const TAXONOMY = [
  // Tech
  ['javascript',  ['javascript','js','node','npm','deno','bun','typescript','ts','react','vue','svelte','angular','nextjs','remix','vite']],
  ['python',      ['python','django','flask','fastapi','pandas','numpy','pytorch','tensorflow']],
  ['css',         ['css','sass','scss','tailwind','styling','stylesheet','flexbox','grid','animation','keyframe']],
  ['web-dev',     ['html','frontend','backend','fullstack','api','rest','graphql','websocket','http','browser','dom']],
  ['devtools',    ['devtools','cli','terminal','shell','bash','zsh','git','github','gitlab','vscode','editor','vim','neovim']],
  ['database',    ['database','sql','postgres','mysql','sqlite','mongodb','redis','supabase','prisma','orm']],
  ['cloud',       ['aws','gcp','azure','cloudflare','vercel','netlify','heroku','docker','kubernetes','k8s','deploy','hosting']],
  ['ai',          ['ai','llm','gpt','claude','gemini','openai','anthropic','machine learning','neural','diffusion','embedding','rag','vector']],
  ['security',    ['security','auth','oauth','jwt','encryption','vulnerability','ctf','hacking','privacy','tls','ssl']],
  ['open-source', ['open source','open-source','github','contributing','oss','license','mit','apache']],
  // Design
  ['design',      ['design','ux','ui','figma','sketch','wireframe','prototype','usability','accessibility','a11y','typography','color']],
  ['fonts',       ['font','typeface','typography','serif','sans-serif','monospace','variable font','type design']],
  ['icons',       ['icon','svg','symbol','glyph','illustration','vector']],
  ['photography', ['photo','photography','camera','lightroom','raw','lens','exposure','instagram','flickr']],
  ['video',       ['video','film','cinema','motion','premiere','after effects','davinci','youtube','vimeo','streaming']],
  // Reading & learning
  ['article',     ['blog','post','article','essay','write-up','opinion','newsletter','substack','medium']],
  ['tutorial',    ['tutorial','guide','how to','howto','step by step','learn','beginner','course','lesson']],
  ['book',        ['book','ebook','reading','literature','novel','nonfiction','isbn','goodreads','audiobook']],
  ['research',    ['paper','research','study','arxiv','doi','academic','journal','science','findings']],
  ['video-lesson',['youtube','lecture','talk','conference','presentation','keynote','screencast']],
  // Productivity
  ['productivity',['productivity','workflow','automation','notion','obsidian','logseq','roam','pkm','second brain','gtd','pomodoro']],
  ['tool',        ['tool','utility','app','software','extension','plugin','addon','widget','generator','converter']],
  ['template',    ['template','starter','boilerplate','scaffold','kit','theme','example','demo']],
  // Topics
  ['music',       ['music','audio','spotify','bandcamp','soundcloud','album','track','playlist','genre','producer','daw','ableton']],
  ['gaming',      ['game','gaming','steam','indie','unity','unreal','pixel','rpg','fps','nintendo','playstation','xbox']],
  ['science',     ['science','physics','biology','chemistry','space','nasa','astronomy','math','mathematics']],
  ['health',      ['health','fitness','wellness','mental health','sleep','nutrition','diet','exercise','meditation']],
  ['finance',     ['finance','money','investing','stocks','crypto','bitcoin','ethereum','budget','economics','startup','vc']],
  ['news',        ['news','politics','world','current events','journalism','media','breaking']],
  ['social',      ['twitter','x.com','mastodon','bluesky','reddit','discord','community','forum','social']],
  ['shop',        ['shop','store','buy','product','amazon','etsy','ecommerce','sale','deal']],
  ['reference',   ['reference','docs','documentation','spec','standard','mdn','wikipedia','cheatsheet','glossary']],
  ['fun',         ['fun','funny','meme','humor','lol','cool','interesting','random','weird','art','creative']],
];

// ── Domain-based tag hints ────────────────────────────────────────────────────
const DOMAIN_TAGS = {
  'github.com':       ['open-source', 'devtools'],
  'stackoverflow.com':['reference',   'web-dev'],
  'youtube.com':      ['video'],
  'youtu.be':         ['video'],
  'medium.com':       ['article'],
  'substack.com':     ['article', 'newsletter'],
  'reddit.com':       ['social'],
  'twitter.com':      ['social'],
  'x.com':            ['social'],
  'bsky.app':         ['social'],
  'arxiv.org':        ['research'],
  'npmjs.com':        ['javascript', 'open-source'],
  'pypi.org':         ['python',     'open-source'],
  'figma.com':        ['design'],
  'dribbble.com':     ['design'],
  'behance.net':      ['design'],
  'codepen.io':       ['web-dev',    'css'],
  'codesandbox.io':   ['web-dev'],
  'notion.so':        ['productivity'],
  'obsidian.md':      ['productivity'],
  'bandcamp.com':     ['music'],
  'soundcloud.com':   ['music'],
  'open.spotify.com': ['music'],
  'goodreads.com':    ['book'],
  'amazon.com':       ['shop'],
  'etsy.com':         ['shop'],
  'wikipedia.org':    ['reference'],
  'mdn.mozilla.org':  ['reference',  'web-dev'],
  'docs.anthropic.com':['ai',        'reference'],
  'openai.com':       ['ai'],
  'huggingface.co':   ['ai',         'open-source'],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function scoreTags(text) {
  const lower = text.toLowerCase();
  const found = new Set();
  for (const [tag, keywords] of TAXONOMY) {
    for (const kw of keywords) {
      if (lower.includes(kw)) { found.add(tag); break; }
    }
  }
  return [...found].slice(0, 6); // max 6 semantic tags
}

async function fetchMeta(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; bookmark-bot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('html')) return { title: url, description: '', image: '' };

    const html = await res.text();
    const $ = cheerio.load(html);

    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').first().text() ||
      url;

    const description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      $('meta[name="twitter:description"]').attr('content') ||
      '';

    const image =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      '';

    const favicon =
      $('link[rel="icon"]').attr('href') ||
      $('link[rel="shortcut icon"]').attr('href') ||
      '/favicon.ico';

    // Resolve relative favicon
    let faviconUrl = '';
    try {
      faviconUrl = new URL(favicon, url).href;
    } catch { faviconUrl = ''; }

    // Keywords from meta tag
    const metaKeywords = $('meta[name="keywords"]').attr('content') || '';

    return {
      title:       title.trim().slice(0, 200),
      description: description.trim().slice(0, 500),
      image:       image.trim(),
      favicon:     faviconUrl,
      keywords:    metaKeywords,
    };
  } catch(e) {
    clearTimeout(timeout);
    return { title: extractDomain(url) || url, description: '', image: '', favicon: '', keywords: '' };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const rawUrls = JSON.parse(process.env.INPUT_URLS || '[]');
  const collection = (process.env.INPUT_COLLECTION || '').trim();

  if (!rawUrls.length) { console.log('No URLs provided.'); process.exit(0); }

  // Load existing bookmarks
  const bmPath = path.resolve('bookmarks.json');
  let data = { bookmarks: [], meta: { updated: '', count: 0 } };
  if (fs.existsSync(bmPath)) {
    try { data = JSON.parse(fs.readFileSync(bmPath, 'utf8')); }
    catch { /* start fresh */ }
  }

  const existing = new Set(data.bookmarks.map(b => b.url));
  const toProcess = rawUrls.filter(u => u && u.startsWith('http') && !existing.has(u));

  console.log(`Processing ${toProcess.length} new URL(s) (${rawUrls.length - toProcess.length} duplicates skipped)`);

  // Process in batches of 5 to avoid rate limits
  const results = [];
  for (let i = 0; i < toProcess.length; i += 5) {
    const batch = toProcess.slice(i, i + 5);
    const settled = await Promise.allSettled(batch.map(async url => {
      console.log(`  → ${url}`);
      const meta = await fetchMeta(url);
      const domain = extractDomain(url);
      const domainTags = DOMAIN_TAGS[domain] || [];
      const textForTags = [meta.title, meta.description, meta.keywords, domain].join(' ');
      const semanticTags = scoreTags(textForTags);
      // Merge domain hints + semantic tags, dedupe
      const tags = [...new Set([...domainTags, ...semanticTags])].slice(0, 8);

      return {
        id:          crypto.randomUUID(),
        url,
        title:       meta.title,
        description: meta.description,
        image:       meta.image,
        favicon:     meta.favicon,
        domain,
        tags,
        collection:  collection || null,
        added:       new Date().toISOString(),
        pinned:      false,
      };
    }));

    for (const r of settled) {
      if (r.status === 'fulfilled') results.push(r.value);
      else console.warn('  ✗ Failed:', r.reason);
    }
    // Small pause between batches
    if (i + 5 < toProcess.length) await new Promise(r => setTimeout(r, 500));
  }

  // Prepend new bookmarks
  data.bookmarks = [...results, ...data.bookmarks];
  data.meta = {
    updated: new Date().toISOString(),
    count:   data.bookmarks.length,
  };

  fs.writeFileSync(bmPath, JSON.stringify(data, null, 2));
  console.log(`✓ Done. bookmarks.json now has ${data.bookmarks.length} bookmark(s).`);
}

main().catch(e => { console.error(e); process.exit(1); });

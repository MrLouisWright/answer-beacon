// answer-beacon: answer-engine (AEO) readiness checks for built static sites. Louis Wright, MIT.
import { contentPages, runBeacon, finder, SITE_OPTIONS, SITE_HELP, siteOptions, robotsDirectives, isNoindex, jsonldNodes, typeName, pageDates, textOf, matchAny } from './site.js';
import { buildReport, UsageError } from './core.js';

export * from './core.js';
export { SITE_OPTIONS, SITE_HELP, siteOptions };

export const RULES = {
  'ai-crawler-blocked': { severity: 'high', title: 'robots.txt blocks an AI crawler you want to allow (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, ...)' },
  'ai-crawler-allowed': { severity: 'medium', title: 'robots.txt allows an AI crawler you asked to block' },
  'ai-meta-blocked': { severity: 'medium', title: 'Page meta tags block AI use (noai, noimageai, or a bot-specific noindex for an AI crawler)' },
  'faq-schema-invalid': { severity: 'high', title: 'FAQPage / QAPage JSON-LD is missing Question name or acceptedAnswer text' },
  'faq-schema-mismatch': { severity: 'medium', title: 'FAQ schema questions do not appear as visible text on the page' },
  'howto-schema-invalid': { severity: 'medium', title: 'HowTo JSON-LD has no step list or steps without text' },
  'question-no-answer': { severity: 'medium', title: 'Question-style heading is not followed by a paragraph answering it' },
  'answer-too-long': { severity: 'low', title: 'The first paragraph after a question heading is too long to quote as a direct answer' },
  'faq-schema-missing': { severity: 'low', title: 'Page has several question headings with answers but no FAQPage/QAPage schema' },
  'llms-txt-missing': { severity: 'low', title: 'No /llms.txt in the build' },
  'llms-txt-invalid': { severity: 'medium', title: 'llms.txt does not follow the format (H1 title, optional > summary, ## sections of - [name](url) links)' },
  'llms-txt-link-missing': { severity: 'medium', title: 'llms.txt links to a page that is not in the build' },
  'author-missing': { severity: 'low', title: 'Article-like page has no author (meta author, JSON-LD author or rel=author)' },
  'date-missing': { severity: 'low', title: 'Article-like page declares no published or modified date' },
  'date-modified-before-published': { severity: 'low', title: 'dateModified is earlier than datePublished' },
  'eeat-pages-missing': { severity: 'info', title: 'No about or contact page found in the build' },
  'organization-schema-missing': { severity: 'info', title: 'Homepage has no Organization/Person/WebSite JSON-LD' },
};

export const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'anthropic-ai', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'Bytespider', 'Amazonbot', 'meta-externalagent', 'cohere-ai', 'DuckAssistBot', 'MistralAI-User'];
export const DEFAULT_ALLOW = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended'];
const QWORDS = /^(what|why|how|when|where|who|whom|which|whose|can|could|should|would|will|is|are|was|were|do|does|did|has|have|may|might|must|shall)\b/i;
export const isQuestion = (t) => /\?\s*$/.test(t) || QWORDS.test(String(t).trim());

/** Parse robots.txt into groups [{ agents:[lowercase], rules:[{allow:boolean,path}] }]. */
export function parseRobots(txt) {
  const groups = []; let cur = null; let lastWasAgent = false;
  for (const raw of String(txt).split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim(); if (!line) continue;
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line); if (!m) continue;
    const k = m[1].toLowerCase(); const v = m[2].trim();
    if (k === 'user-agent') { if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastWasAgent = true; continue; }
    lastWasAgent = false;
    if (cur && (k === 'allow' || k === 'disallow')) cur.rules.push({ allow: k === 'allow', path: v });
  }
  return groups;
}
/** Is `path` allowed for `bot` (longest-match, Allow wins ties)? Returns { allowed, group }. */
export function robotsAllows(groups, bot, path = '/') {
  const b = bot.toLowerCase();
  let g = groups.filter((x) => x.agents.includes(b));
  const explicit = g.length > 0;
  if (!g.length) g = groups.filter((x) => x.agents.includes('*'));
  const rules = g.flatMap((x) => x.rules).filter((r) => r.path !== '' || !r.allow);
  let best = null;
  for (const r of rules) {
    if (r.path === '') continue;
    const re = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (re.test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return { allowed: !best || best.allow, explicit };
}

/** Validate llms.txt (https://llmstxt.org). Returns { errors:[], links:[{text,url,line}] }. */
export function parseLlmsTxt(txt) {
  const lines = String(txt).split(/\r?\n/); const errors = []; const links = [];
  const first = lines.findIndex((l) => l.trim());
  if (first === -1) return { errors: ['file is empty'], links };
  if (!/^#\s+\S/.test(lines[first])) errors.push(`line ${first + 1}: must start with an H1 title ("# Project name")`);
  if (lines.filter((l) => /^#\s/.test(l)).length > 1) errors.push('only one H1 is allowed');
  let section = false;
  lines.forEach((l, i) => {
    if (/^##\s+\S/.test(l)) { section = true; return; }
    if (/^\s*[-*]\s+/.test(l) && section) { const m = /^\s*[-*]\s+\[([^\]]+)\]\(([^)\s]+)\)(?:\s*:\s*.*)?\s*$/.exec(l); if (!m) errors.push(`line ${i + 1}: list items in sections must be "- [name](url): optional notes"`); else links.push({ text: m[1], url: m[2], line: i + 1 }); }
    if (/^#{3,}\s/.test(l)) errors.push(`line ${i + 1}: use ## for sections (no deeper headings)`);
  });
  if (!links.length) errors.push('no "- [name](url)" links found under ## sections');
  return { errors, links };
}

const articleLike = (pg, nodes) => nodes.some((n) => n.types.map(typeName).some((t) => /^(Article|BlogPosting|NewsArticle|TechArticle|Report|ScholarlyArticle|HowTo|Recipe)$/.test(t))) || pg.doc.metaContent('og:type') === 'article' || pg.doc.all.some((e) => e.tag === 'article');
const textAfter = (h) => { // first <p> (or list) after heading h in document order, before next heading
  const all = h.doc.all; const i = all.indexOf(h.el);
  for (let k = i + 1; k < all.length; k++) { const e = all[k]; if (/^h[1-6]$/.test(e.tag)) return null; if (e.tag === 'p' || e.tag === 'ul' || e.tag === 'ol' || e.tag === 'dd' || e.tag === 'table') { if (h.el.children && isInside(e, h.el)) continue; const t = textOf(e); if (t) return { text: t, line: e.line, tag: e.tag }; } }
  return null;
};
const isInside = (e, anc) => { for (let n = e.parent; n; n = n.parent) if (n === anc) return true; return false; };
const nrm = (s) => String(s || '').toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function analyze(site, opts = {}, config = {}) {
  const { findings, add } = finder(RULES);
  const allow = (opts.allowBots?.length ? opts.allowBots : config.allowBots) ?? DEFAULT_ALLOW;
  const block = (opts.blockBots?.length ? opts.blockBots : config.blockBots) ?? [];
  const maxWords = opts.maxAnswerWords ?? config.maxAnswerWords ?? 60;
  const minQ = config.faqMinQuestions ?? 3;
  const skipEeat = [...(config.notArticles || []), ...(opts.notArticles || [])];
  const pages = contentPages(site).filter((p) => !isNoindex(robotsDirectives(site, p)));
  // robots.txt AI crawler rules
  const robots = site.read('robots.txt');
  if (robots != null) {
    const groups = parseRobots(robots);
    for (const bot of allow) { const r = robotsAllows(groups, bot, '/'); if (!r.allowed) add('ai-crawler-blocked', bot, `robots.txt blocks ${bot} from /${r.explicit ? '' : ' (via User-agent: *)'}`, `Add "User-agent: ${bot}\\nAllow: /" or remove the Disallow, or move ${bot} to blockBots if this is intended.`, { file: 'robots.txt' }); }
    for (const bot of block) { const r = robotsAllows(groups, bot, '/'); if (r.allowed) add('ai-crawler-allowed', bot, `robots.txt does not block ${bot}`, `Add "User-agent: ${bot}\\nDisallow: /".`, { file: 'robots.txt' }); }
  }
  // llms.txt
  const llms = site.read('llms.txt');
  if (llms == null) { if (opts.requireLlmsTxt ?? config.requireLlmsTxt ?? true) add('llms-txt-missing', 'llms.txt', 'No llms.txt at the site root', 'Add /llms.txt: "# Site name", a "> one-line summary", then "## Docs" sections of "- [Page](https://…): notes" links (see llmstxt.org).', { file: 'llms.txt' }); }
  else {
    const p = parseLlmsTxt(llms);
    for (const e of p.errors) add('llms-txt-invalid', 'llms.txt', `llms.txt: ${e}`, 'Follow the llmstxt.org format.', { file: 'llms.txt', line: Number(/^line (\d+)/.exec(e)?.[1]) || undefined });
    for (const l of p.links) { let u; try { u = new URL(l.url, (site.origin || 'http://site.invalid') + '/'); } catch { u = null; } if (!u) continue; if (site.origin && u.origin !== site.origin) continue; if (!site.origin && /^https?:/i.test(l.url)) continue; const rel = decodeURIComponent(u.pathname).replace(/^\//, ''); if (site.find(u) || (rel && site.exists(rel))) continue; add('llms-txt-link-missing', l.url, `llms.txt links to ${l.url}, which is not in the build`, 'Fix the URL or remove the entry.', { file: 'llms.txt', line: l.line }); }
  }
  // pages
  let qCount = 0; let faqPages = 0;
  for (const pg of pages) {
    const doc = pg.doc; const nodes = jsonldNodes(doc); const types = nodes.map((n) => n.types.map(typeName));
    for (const m of doc.metas) {
      const c = String(m.content || '').toLowerCase();
      if (m.name === 'robots' && /\bnoai\b|\bnoimageai\b/.test(c)) add('ai-meta-blocked', pg.path, `${pg.path} sets robots "${m.content}"`, 'Remove noai/noimageai if you want answer engines to use this page.', { file: pg.file, line: m.line });
      else if (m.name && AI_BOTS.map((b) => b.toLowerCase()).includes(m.name) && /noindex|none|nosnippet/.test(c) && allow.map((b) => b.toLowerCase()).includes(m.name)) add('ai-meta-blocked', pg.path, `${pg.path} sets <meta name="${m.name}" content="${m.content}">`, `Remove it, or move ${m.name} to blockBots.`, { file: pg.file, line: m.line });
    }
    // question headings
    const qs = doc.headings.filter((h) => !h.hidden && h.level >= 2 && isQuestion(h.text));
    let answered = 0;
    for (const h of qs) {
      qCount++; const a = textAfter({ ...h, doc });
      if (!a) { add('question-no-answer', pg.path, `"${h.text}" has no answer paragraph after it`, 'Answer the question directly in the first paragraph under the heading.', { file: pg.file, line: h.line }); continue; }
      answered++;
      const wc = a.text.split(/\s+/).filter(Boolean).length;
      if (a.tag === 'p' && wc > maxWords) add('answer-too-long', pg.path, `Answer to "${h.text}" starts with a ${wc}-word paragraph`, `Lead with a 1–2 sentence answer (≤ ${maxWords} words), then expand.`, { file: pg.file, line: a.line });
    }
    // FAQ / QAPage schema
    const faqNodes = nodes.filter((n) => n.types.map(typeName).some((t) => t === 'FAQPage' || t === 'QAPage'));
    if (faqNodes.length) faqPages++;
    const visible = nrm(doc.text);
    for (const n of faqNodes) {
      const isQA = n.types.map(typeName).includes('QAPage');
      const qsArr = [].concat(n.node.mainEntity ?? []);
      if (!qsArr.length) { add('faq-schema-invalid', pg.path, `${isQA ? 'QAPage' : 'FAQPage'} has no mainEntity questions`, 'Add mainEntity: [{ "@type": "Question", "name": "…", "acceptedAnswer": { "@type": "Answer", "text": "…" } }].', { file: pg.file, line: n.line }); continue; }
      for (const q of qsArr) {
        const ans = [].concat(q?.acceptedAnswer ?? [], isQA ? [].concat(q?.suggestedAnswer ?? []) : []);
        if (!q || !q.name || !ans.length || !ans.some((x) => x && x.text)) { add('faq-schema-invalid', pg.path, `Question "${q?.name ?? '(no name)'}" is missing ${!q?.name ? 'name' : 'acceptedAnswer.text'}`, 'Each Question needs "name" and acceptedAnswer with "text".', { file: pg.file, line: n.line }); continue; }
        if (!visible.includes(nrm(q.name))) add('faq-schema-mismatch', pg.path, `FAQ question "${q.name}" is not visible on the page`, 'Structured data must match visible content: show the question and answer on the page, or remove it from the schema.', { file: pg.file, line: n.line });
      }
    }
    if (!faqNodes.length && answered >= minQ && !types.flat().some((t) => /^(FAQPage|QAPage|HowTo)$/.test(t))) add('faq-schema-missing', pg.path, `${pg.path} answers ${answered} questions but has no FAQPage schema`, 'Add FAQPage JSON-LD mirroring the visible questions and answers.', { file: pg.file });
    for (const n of nodes.filter((x) => x.types.map(typeName).includes('HowTo'))) {
      const steps = [].concat(n.node.step ?? []);
      const flat = steps.flatMap((s) => (typeName(s?.['@type'] || '') === 'HowToSection' ? [].concat(s.itemListElement ?? []) : [s]));
      if (!flat.length || flat.some((s) => !(typeof s === 'string' ? s : s?.text || s?.name))) add('howto-schema-invalid', pg.path, `HowTo "${n.node.name ?? ''}" has ${flat.length ? 'steps without text' : 'no steps'}`, 'Give HowTo a "step" list of HowToStep items with "text".', { file: pg.file, line: n.line });
    }
    // E-E-A-T on article-like pages
    if (articleLike(pg, nodes) && !matchAny(skipEeat, pg.path) && !matchAny(skipEeat, pg.file)) {
      const hasAuthor = !!doc.metaContent('author') || doc.links.some((l) => l.rel.includes('author')) || doc.anchors.some((a) => a.rel.includes('author')) || nodes.some((n) => n.node.author) || doc.all.some((e) => e.attrs.itemprop === 'author' || /\b(author|byline)\b/.test(e.attrs.class || ''));
      if (!hasAuthor) add('author-missing', pg.path, `${pg.path} looks like an article but names no author`, 'Add a visible byline plus "author" in Article JSON-LD (Person with name and url).', { file: pg.file });
      const d = pageDates(doc);
      if (!d.published && !d.modified && !doc.all.some((e) => e.tag === 'time' && e.attrs.datetime)) add('date-missing', pg.path, `${pg.path} looks like an article but declares no date`, 'Add datePublished/dateModified to Article JSON-LD and a visible <time datetime>.', { file: pg.file });
      else if (d.published && d.modified && d.modified < d.published) add('date-modified-before-published', pg.path, `${pg.path}: dateModified ${d.modified.toISOString().slice(0, 10)} is before datePublished ${d.published.toISOString().slice(0, 10)}`, 'Fix the dates.', { file: pg.file });
    }
  }
  const home = site.find('/');
  if (home && !jsonldNodes(home.doc).some((n) => n.types.map(typeName).some((t) => /^(Organization|Person|WebSite|LocalBusiness|Corporation|NewsMediaOrganization)$/.test(t)))) add('organization-schema-missing', '/', 'Homepage has no Organization, Person or WebSite JSON-LD', 'Add Organization (name, url, logo, sameAs) or Person JSON-LD to the homepage.', { file: home.file });
  if (pages.length >= 3 && !pages.some((p) => /(^|\/)(about|about-us|contact|contact-us|team|imprint|impressum)(\/index)?(\.html?)?$/i.test(p.file.replace(/\.html?$/, '')))) add('eeat-pages-missing', 'about', 'No about or contact page found', 'Publish an About page (who is behind the site) and a Contact page.', {});
  return { findings, info: { questions: qCount, faqPages, robotsTxt: robots != null, llmsTxt: llms != null }, summary: `${pages.length} indexable page(s); ${qCount} question heading(s); robots.txt ${robots != null ? 'found' : 'not found'}; llms.txt ${llms != null ? 'found' : 'not found'}` };
}

export function check(dir, opts = {}, config = {}, configFile) {
  const tool = { name: 'answer-beacon', version: opts.toolVersion || '1.0.0', rules: RULES, emoji: '💬', defaultFile: 'index.html' };
  return runBeacon(tool, dir, { ...opts, UsageError }, config, configFile, analyze, buildReport);
}

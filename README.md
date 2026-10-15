# answer-beacon

[![npm version](https://img.shields.io/npm/v/answer-beacon.svg)](https://www.npmjs.com/package/answer-beacon) [![CI](https://github.com/MrLouisWright/answer-beacon/actions/workflows/ci.yml/badge.svg)](https://github.com/MrLouisWright/answer-beacon/actions/workflows/ci.yml) [![Node](https://img.shields.io/node/v/answer-beacon.svg)](https://nodejs.org) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> Check that your built static site is ready for answer engines and AI search: direct answers, FAQ schema, llms.txt, AI crawler access and E-E-A-T signals.

Answer engines (ChatGPT search, Perplexity, Claude, Google AI Overviews) quote pages that answer a question in the first sentence, mark it up, let their crawlers in and show who wrote it and when. Sites lose that in small ways: a blanket `User-agent: * Disallow: /` that also blocks GPTBot, FAQ schema whose questions are not on the page, a question heading followed by a 200-word preamble, an `llms.txt` with broken links. `answer-beacon` reads the build, robots.txt and llms.txt and reports each gap with the file, line, severity and a **concrete fix**.

CLI, library and GitHub Action. Node.js 18+, **zero runtime dependencies**. Works on any static build output (Astro, Next.js `output: 'export'`, Eleventy, Hugo, Jekyll, Docusaurus, VitePress, plain HTML) and runs offline: point it at the folder your build writes. By Louis Wright.

## Features

- **Direct answers:** question-style headings (`What…`, `How…`, `…?`) must be followed by a paragraph or list that answers them, and the first paragraph should be short enough to quote (`--max-answer-words`, default 60).
- **FAQ / QAPage / HowTo schema:** every Question needs `name` and `acceptedAnswer.text` (QAPage also accepts `suggestedAnswer`), FAQ questions must be visible on the page, HowTo needs steps with text, and pages answering 3+ questions are nudged to add FAQPage.
- **llms.txt:** present, H1 title, `##` sections of `- [name](url): notes` links, and internal links that exist in the build.
- **AI crawler access in robots.txt:** GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, PerplexityBot and Google-Extended allowed by default (`--allow-bots`), with `--block-bots` for crawlers you want kept out (CCBot, Bytespider, ...). Uses real robots.txt group and longest-match semantics, including `User-agent: *` fallback.
- **AI meta tags:** `noai`/`noimageai` and bot-specific `<meta name="GPTBot" content="noindex">` on pages you want quoted.
- **E-E-A-T:** article-like pages need an author and a date; `dateModified` must not precede `datePublished`; homepage Organization/Person/WebSite schema; an About or Contact page.
- Text/JSON/SARIF/Markdown output, `--fail-on`, exit codes 0/1/2, allowlist with expiry, severity overrides, GitHub Action with job summary.

### Scope

answer-beacon only reads robots.txt for AI-crawler rules; general robots.txt hygiene is covered by securitytxt-sentinel. Meta robots / X-Robots-Tag indexability is index-beacon, and general schema.org validation is schema-beacon.

## Rules

| Rule | Default severity | What it means |
|---|---|---|
| `ai-crawler-blocked` | high | robots.txt blocks an AI crawler you want to allow (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, ...) |
| `ai-crawler-allowed` | medium | robots.txt allows an AI crawler you asked to block |
| `ai-meta-blocked` | medium | Page meta tags block AI use (noai, noimageai, or a bot-specific noindex for an AI crawler) |
| `faq-schema-invalid` | high | FAQPage / QAPage JSON-LD is missing Question name or acceptedAnswer text |
| `faq-schema-mismatch` | medium | FAQ schema questions do not appear as visible text on the page |
| `howto-schema-invalid` | medium | HowTo JSON-LD has no step list or steps without text |
| `question-no-answer` | medium | Question-style heading is not followed by a paragraph answering it |
| `answer-too-long` | low | The first paragraph after a question heading is too long to quote as a direct answer |
| `faq-schema-missing` | low | Page has several question headings with answers but no FAQPage/QAPage schema |
| `llms-txt-missing` | low | No /llms.txt in the build |
| `llms-txt-invalid` | medium | llms.txt does not follow the format (H1 title, optional > summary, ## sections of - [name](url) links) |
| `llms-txt-link-missing` | medium | llms.txt links to a page that is not in the build |
| `author-missing` | low | Article-like page has no author (meta author, JSON-LD author or rel=author) |
| `date-missing` | low | Article-like page declares no published or modified date |
| `date-modified-before-published` | low | dateModified is earlier than datePublished |
| `eeat-pages-missing` | info | No about or contact page found in the build |
| `organization-schema-missing` | info | Homepage has no Organization/Person/WebSite JSON-LD |
| `allowlist-expired` | medium | An allowlist entry is past its `expires` date |
| `allowlist-unused` | info | An allowlist entry matched nothing |

## Install and run

```bash
npx answer-beacon dist
npx answer-beacon dist --block-bots CCBot,Bytespider --fail-on medium
npx answer-beacon public --allow-bots GPTBot,PerplexityBot --max-answer-words 45
npx answer-beacon out --no-llms-txt --not-articles "/docs/**"
```

Pages are mapped to URLs the way static hosts serve them: `index.html` → `/`, `blog/index.html` → `/blog/`, `about.html` → `/about.html` (or `/about` with `--clean-urls`). Pass `--base-url` with your public URL, or let it be inferred from canonical / `og:url` tags. Meta-refresh redirect stubs and `404.html` are skipped. `X-Robots-Tag` and `Link` headers are read from Netlify/Cloudflare `_headers` and `vercel.json`.

### Sample output

```text
answer-beacon — https://example.com
6 indexable page(s); 5 question heading(s); robots.txt found; llms.txt found

HIGH     faq.html:1 Question "No answer?" is missing acceptedAnswer.text [faq-schema-invalid]
         ↳ fix: Each Question needs "name" and acceptedAnswer with "text".
HIGH     robots.txt robots.txt blocks GPTBot from / [ai-crawler-blocked]
         ↳ fix: Add "User-agent: GPTBot\nAllow: /" or remove the Disallow, or move GPTBot to blockBots if this is intended.
HIGH     robots.txt robots.txt blocks OAI-SearchBot from / (via User-agent: *) [ai-crawler-blocked]
         ↳ fix: Add "User-agent: OAI-SearchBot\nAllow: /" or remove the Disallow, or move OAI-SearchBot to blockBots if this is intended.
HIGH     robots.txt robots.txt blocks ChatGPT-User from / (via User-agent: *) [ai-crawler-blocked]
```

## Options

```text
answer-beacon 1.0.0 — check your built static site is ready for answer engines and AI search

Usage: answer-beacon [site-dir] [options]

Site
      --base-url <url>        Public URL of the site, e.g. https://example.com (default: inferred from canonical/og:url)
      --include <globs>       Only check these pages (file or URL path globs, comma-separated)
      --exclude <globs>       Skip these pages
      --clean-urls            Pages are served without .html (about.html -> /about)
Checks
      --allow-bots <names>     AI crawlers that must be allowed in robots.txt (default: GPTBot, OAI-SearchBot,
                               ChatGPT-User, ClaudeBot, Claude-SearchBot, PerplexityBot, Google-Extended)
      --block-bots <names>     AI crawlers that must be blocked
      --max-answer-words <n>   Longest acceptable direct answer paragraph (default 60)
      --no-llms-txt            Do not require /llms.txt
      --not-articles <globs>   Pages that should not be checked for author/date

Common
  -c, --config <file>     JSON config (default: .answer-beacon.json or "answerBeacon" in package.json)
  -f, --format <fmt>      text (default) | json | sarif | markdown
      --json <file>       Also write a JSON report
      --sarif <file>      Also write SARIF 2.1.0
      --markdown <file>   Also write Markdown (e.g. for a job summary)
      --fail-on <sev>     critical | high | medium | low | info | none (default: high)
      --list-rules        Print rules and default severities
      --no-fixes          Hide fix suggestions in text output
      --no-color          Disable colours
  -v, --version / -h, --help

Exit codes: 0 = passed, 1 = findings at or above --fail-on, 2 = usage, config or read error.
```

## Configuration and allowlist

Options can live in `.answer-beacon.json` (or a `"answerBeacon"` key in `package.json`, or `--config <file>`):

```json
{
  "failOn": "medium",
  "severity": {
    "ai-crawler-blocked": "low"
  },
  "allowlist": [
    {
      "rule": "llms-txt-missing",
      "subject": "llms.txt",
      "reason": "llms.txt is being written",
      "expires": "2027-03-31"
    }
  ],
  "allowBots": [
    "GPTBot",
    "ClaudeBot",
    "PerplexityBot",
    "Google-Extended"
  ],
  "blockBots": [
    "CCBot"
  ],
  "maxAnswerWords": 60
}
```

- **`severity`** changes a rule's severity, or turns it `"off"`.
- **`allowlist`** entries suppress matching findings. Each needs a `reason` and matches on any combination of `rule`, `file`, `subject` (globs with `*`) and `match` (a substring of the message). Add `expires` (`YYYY-MM-DD`) so the exception is time-boxed: once it lapses the finding comes back along with an `allowlist-expired` finding (medium). Entries that no longer match anything are reported as `allowlist-unused` (info).

Config can also set `baseUrl`, `include`, `exclude` and `cleanUrls`. The config file is looked up in the site directory first, then in the current directory, so `.answer-beacon.json` can live at your repository root. Other keys: `allowBots`, `blockBots`, `maxAnswerWords`, `"requireLlmsTxt": false`, `notArticles` (globs) and `faqMinQuestions` (default 3).

## Output and exit codes

- `--format text` (default), `json`, `sarif` (SARIF 2.1.0 for GitHub code scanning) or `markdown` (for job summaries and PR comments). `--json`, `--sarif` and `--markdown` write extra report files in the same run.
- `--fail-on <severity>` sets the threshold (`critical`, `high`, `medium`, `low`, `info`, `none`; default `high`).
- Exit codes: **0** passed, **1** findings at or above `--fail-on`, **2** usage, config or read error.

## GitHub Action

```yaml
permissions:
  contents: read
  security-events: write   # only needed for the SARIF upload
jobs:
  answer-beacon:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with: { persist-credentials: false }
      - run: npm ci && npm run build   # produce the static site first
      - uses: MrLouisWright/answer-beacon@v1
        with:
          path: dist
          fail-on: high
          sarif: answer-beacon.sarif
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with: { sarif_file: answer-beacon.sarif }
```

| Input | Description | Default |
|---|---|---|
| `path` | Built site directory (e.g. dist, public, _site) | `.` |
| `base-url` | Public URL of the site, e.g. https://example.com | |
| `fail-on` | Failure threshold | `high` |
| `config` | Config file path | |
| `sarif` / `json` | Write SARIF / JSON report to this path | |
| `job-summary` | Add the Markdown report to the job summary | `true` |
| `args` | Extra CLI arguments | |

The action runs the bundled CLI with Node 20; it has no dependencies to install. Pin it to a commit SHA if your policy requires it.

## Library

```js
import { check, parseRobots, robotsAllows, parseLlmsTxt } from "answer-beacon";
const report = check("dist", { blockBots: ["CCBot"] });
robotsAllows(parseRobots(txt), "GPTBot", "/"); // { allowed, explicit }
```

Types are included.

## Requirements

Node.js 18 or newer. Zero runtime dependencies.

## Support

If this project is useful to you, you can support its development with a donation: [Buy me a coffee](https://donate.stripe.com/aFa00lek3cvX4Ds2Fk9EI0b). It helps keep these tools maintained, documented and free for everyone.

## Licence

MIT © Louis Wright ([Louis Wright](https://github.com/MrLouisWright))

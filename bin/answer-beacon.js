#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { mainCli, check, RULES, SITE_OPTIONS, SITE_HELP, UsageError, splitList } from '../src/index.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
mainCli({
  name: 'answer-beacon', version: pkg.version, configKey: 'answerBeacon', rules: RULES,
  tagline: 'check your built static site is ready for answer engines and AI search',
  usage: 'Usage: answer-beacon [site-dir] [options]',
  help: `${SITE_HELP}Checks
      --allow-bots <names>     AI crawlers that must be allowed in robots.txt (default: GPTBot, OAI-SearchBot,
                               ChatGPT-User, ClaudeBot, Claude-SearchBot, PerplexityBot, Google-Extended)
      --block-bots <names>     AI crawlers that must be blocked
      --max-answer-words <n>   Longest acceptable direct answer paragraph (default 60)
      --no-llms-txt            Do not require /llms.txt
      --not-articles <globs>   Pages that should not be checked for author/date
`,
  options: { ...SITE_OPTIONS, 'allow-bots': { type: 'string', multiple: true }, 'block-bots': { type: 'string', multiple: true }, 'max-answer-words': { type: 'string' }, 'no-llms-txt': { type: 'boolean' }, 'not-articles': { type: 'string', multiple: true } },
  run: async ({ dir, values: o, config, configFile }) => {
    let mw; if (o['max-answer-words'] != null) { mw = Number(o['max-answer-words']); if (!(mw >= 5)) throw new UsageError('--max-answer-words must be a number >= 5'); }
    const allowBots = splitList(o['allow-bots']); const blockBots = splitList(o['block-bots']);
    return check(dir, { cli: o, allowBots, blockBots, maxAnswerWords: mw, requireLlmsTxt: o['no-llms-txt'] ? false : undefined, notArticles: splitList(o['not-articles']), toolVersion: pkg.version }, config, configFile);
  },
});

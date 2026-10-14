import type { Report, Rule } from './core.js';
export * from './core.js';
export interface AnswerOptions {
  baseUrl?: string; include?: string[]; exclude?: string[]; cleanUrls?: boolean;
  /** AI crawlers that must be allowed in robots.txt (default DEFAULT_ALLOW). */
  allowBots?: string[];
  /** AI crawlers that must be blocked. */
  blockBots?: string[];
  /** Longest acceptable direct-answer paragraph in words (default 60). */
  maxAnswerWords?: number;
  /** Require /llms.txt (default true). */
  requireLlmsTxt?: boolean;
  /** Pages not checked for author/date. */
  notArticles?: string[];
  now?: Date; toolVersion?: string; [option: string]: unknown;
}
export interface RobotsGroup { agents: string[]; rules: { allow: boolean; path: string }[] }
export declare const RULES: Record<string, Rule>;
export declare const AI_BOTS: string[];
export declare const DEFAULT_ALLOW: string[];
export declare const SITE_OPTIONS: Record<string, { type: 'string' | 'boolean'; multiple?: boolean }>;
export declare const SITE_HELP: string;
export declare function check(dir: string, opts?: AnswerOptions, config?: Record<string, unknown>, configFile?: string): Report;
export declare function analyze(site: unknown, opts?: AnswerOptions, config?: Record<string, unknown>): { findings: Report['findings']; info: Record<string, unknown>; summary: string };
export declare function parseRobots(text: string): RobotsGroup[];
export declare function robotsAllows(groups: RobotsGroup[], bot: string, path?: string): { allowed: boolean; explicit: boolean };
export declare function parseLlmsTxt(text: string): { errors: string[]; links: { text: string; url: string; line: number }[] };
export declare function isQuestion(text: string): boolean;

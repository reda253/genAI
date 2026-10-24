// System prompts live in prompts/*.md (P5) so they can be tuned without touching agent code.
import { readFileSync } from 'node:fs';

const DIR = new URL('../../../prompts/', import.meta.url);
const cache = new Map<string, string>();

export function loadPrompt(name: 'leak_hunter' | 'explainer' | 'cfo_rank'): string {
  let text = cache.get(name);
  if (text === undefined) {
    text = readFileSync(new URL(`${name}.md`, DIR), 'utf8');
    cache.set(name, text);
  }
  return text;
}

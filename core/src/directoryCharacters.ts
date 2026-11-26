/**
 * A Directory's default characters: who agents launched into it wear when no
 * character was picked from the roster.
 *
 * Pure (no DOM, no Node): the server validates and applies them, the webview
 * shows them. Characters are palette indices — profile N is palette N, then any
 * external char_N.png — like every other character reference on the wire.
 */

import type { DirectoryCharacterOrder } from './messages.js';

/** The most defaults a Directory keeps (more could never all be shown or worn). */
export const MAX_DIRECTORY_CHARACTERS = 64;

/** A loose value as a Directory's defaults: non-negative integers, deduped (first
 *  occurrence keeps its priority), at most MAX_DIRECTORY_CHARACTERS. */
export function parseDirectoryCharacters(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const v of raw) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || out.includes(v)) continue;
    out.push(v);
    if (out.length === MAX_DIRECTORY_CHARACTERS) break;
  }
  return out;
}

/** A loose value as a pick order; anything but 'random' is the default, 'priority'. */
export function parseCharacterOrder(raw: unknown): DirectoryCharacterOrder {
  return raw === 'random' ? 'random' : 'priority';
}

/**
 * The character an agent in a Directory wears, or undefined to leave it to the
 * server's own random pick (pickRandomPalette) when the Directory has no
 * default left in the cast.
 *
 * The defaults with the fewest copies in the office (`worn`: palette → copies)
 * are the candidates, so one no agent wears comes first, and once every
 * default is in the office the project's character is worn again — as its next
 * repeat, in the next clothes colour (repeatFor) — rather than a stranger's:
 * every agent in a project looks like the project, the copies spread evenly.
 *
 * - `priority`: the first candidate in the Directory's order.
 * - `random`: a random candidate.
 *
 * Defaults past `paletteCount` (a deleted character) are skipped.
 */
export function pickDirectoryCharacter(
  characters: readonly number[],
  order: DirectoryCharacterOrder,
  paletteCount: number,
  worn: ReadonlyMap<number, number>,
  random: () => number = Math.random,
): number | undefined {
  const valid = characters.filter((c) => c < paletteCount);
  if (valid.length === 0) return undefined;
  const copies = (c: number) => worn.get(c) ?? 0;
  const fewest = Math.min(...valid.map(copies));
  const candidates = valid.filter((c) => copies(c) === fewest);
  return order === 'priority'
    ? candidates[0]
    : candidates[Math.floor(random() * candidates.length)];
}

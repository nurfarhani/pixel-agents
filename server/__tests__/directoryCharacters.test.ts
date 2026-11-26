import { describe, expect, it } from 'vitest';

import {
  MAX_DIRECTORY_CHARACTERS,
  parseCharacterOrder,
  parseDirectoryCharacters,
  pickDirectoryCharacter,
} from '../../core/src/directoryCharacters.js';
import {
  chooseLook,
  pickRandomPalette,
  repeatFor,
  rosterPick,
} from '../../core/src/paletteUtils.js';

describe('parseDirectoryCharacters', () => {
  it('keeps non-negative integers in order, first occurrence wins', () => {
    expect(parseDirectoryCharacters([2, 0, 2, -1, 1.5, '3', null, 5])).toEqual([2, 0, 5]);
  });

  it('is empty for anything but an array', () => {
    expect(parseDirectoryCharacters(undefined)).toEqual([]);
    expect(parseDirectoryCharacters({ 0: 1 })).toEqual([]);
  });

  it('caps the list', () => {
    const many = Array.from({ length: MAX_DIRECTORY_CHARACTERS + 5 }, (_, i) => i);
    expect(parseDirectoryCharacters(many)).toHaveLength(MAX_DIRECTORY_CHARACTERS);
  });
});

describe('parseCharacterOrder', () => {
  it("defaults to 'priority'", () => {
    expect(parseCharacterOrder('random')).toBe('random');
    expect(parseCharacterOrder('priority')).toBe('priority');
    expect(parseCharacterOrder('shuffle')).toBe('priority');
    expect(parseCharacterOrder(undefined)).toBe('priority');
  });
});

describe('pickDirectoryCharacter', () => {
  const none = new Map<number, number>();
  /** palette → copies in the office */
  const worn = (entries: Record<number, number>) =>
    new Map(Object.entries(entries).map(([palette, n]) => [Number(palette), n]));

  it('priority: the first default nobody wears', () => {
    expect(pickDirectoryCharacter([3, 1, 2], 'priority', 6, none)).toBe(3);
    expect(pickDirectoryCharacter([3, 1, 2], 'priority', 6, worn({ 3: 1 }))).toBe(1);
  });

  it("priority: every default worn → the project's character again, the first of the least worn", () => {
    expect(pickDirectoryCharacter([3, 1], 'priority', 6, worn({ 1: 1, 3: 1 }))).toBe(3);
    expect(pickDirectoryCharacter([3, 1], 'priority', 6, worn({ 3: 2, 1: 1 }))).toBe(1);
    expect(pickDirectoryCharacter([3], 'priority', 6, worn({ 3: 4 }))).toBe(3);
  });

  it('random: among the defaults nobody wears', () => {
    const three = worn({ 3: 1 });
    expect(pickDirectoryCharacter([3, 1, 2], 'random', 6, three, () => 0)).toBe(1);
    expect(pickDirectoryCharacter([3, 1, 2], 'random', 6, three, () => 0.99)).toBe(2);
  });

  it('random: every default worn → a random one of the least worn', () => {
    const both = worn({ 1: 1, 3: 1 });
    expect(pickDirectoryCharacter([3, 1], 'random', 6, both, () => 0)).toBe(3);
    expect(pickDirectoryCharacter([3, 1], 'random', 6, both, () => 0.99)).toBe(1);
    expect(pickDirectoryCharacter([3, 1], 'random', 6, worn({ 3: 1, 1: 2 }), () => 0.99)).toBe(3);
  });

  it('skips defaults past the cast', () => {
    expect(pickDirectoryCharacter([9, 2], 'priority', 6, none)).toBe(2);
    expect(pickDirectoryCharacter([9], 'random', 6, none)).toBeUndefined();
    expect(pickDirectoryCharacter([9], 'priority', 6, worn({ 9: 1 }))).toBeUndefined();
  });

  it('is undefined with no defaults', () => {
    expect(pickDirectoryCharacter([], 'priority', 6, none)).toBeUndefined();
    expect(pickDirectoryCharacter([], 'random', 6, none)).toBeUndefined();
  });
});

/** Agents wearing these palettes, each the first of its character. */
const wearing = (...palettes: number[]) => palettes.map((palette) => ({ palette }));

describe('pickRandomPalette', () => {
  it('never repeats a character in the office while another is free', () => {
    expect(pickRandomPalette(4, wearing(0, 2), () => 0)).toBe(1);
    expect(pickRandomPalette(4, wearing(0, 2), () => 0.99)).toBe(3);
  });

  it('prefers free characters no Directory reserves', () => {
    const reserved = new Set([1, 2]);
    expect(pickRandomPalette(4, wearing(3), () => 0, reserved)).toBe(0);
    expect(pickRandomPalette(4, wearing(3), () => 0.99, reserved)).toBe(0);
  });

  it("takes a reserved one when every free character is some Directory's", () => {
    expect(pickRandomPalette(4, wearing(0, 3), () => 0.99, new Set([1, 2]))).toBe(2);
  });

  it('repeats only when the whole cast is in the office', () => {
    expect(pickRandomPalette(3, wearing(0, 1, 2), () => 0.5)).toBe(1);
  });
});

describe('repeatFor', () => {
  it('is 0 when no one wears the character as drawn', () => {
    expect(repeatFor(1, [])).toBe(0);
    expect(repeatFor(1, [{ palette: 1, repeat: 1 }])).toBe(0);
  });

  it('counts up for each further copy', () => {
    const worn: { palette: number; repeat: number }[] = [];
    const repeats: number[] = [];
    for (let i = 0; i < 4; i++) {
      const repeat = repeatFor(1, worn);
      repeats.push(repeat);
      worn.push({ palette: 1, repeat });
    }
    expect(repeats).toEqual([0, 1, 2, 3]);
  });

  it("takes the lowest one a copy that left freed, and ignores other characters' repeats", () => {
    const worn = [
      { palette: 1, repeat: 0 },
      { palette: 1, repeat: 2 },
      { palette: 2, repeat: 1 },
    ];
    expect(repeatFor(1, worn)).toBe(1);
  });
});

describe('rosterPick', () => {
  it('takes an integer naming a character in the cast', () => {
    expect(rosterPick(0, 3)).toBe(0);
    expect(rosterPick(2, 3)).toBe(2);
  });

  it('drops anything else off the wire', () => {
    for (const raw of [undefined, null, '1', 1.5, -1, 3, Number.NaN, Infinity]) {
      expect(rosterPick(raw, 3)).toBeUndefined();
    }
  });
});

describe('chooseLook', () => {
  const directory = { characters: [3, 1], characterOrder: 'priority' as const };

  it('wears a roster pick even when it is taken, as its next repeat', () => {
    expect(chooseLook({ paletteCount: 6, worn: wearing(4), picked: 4, directory })).toEqual({
      palette: 4,
      repeat: 1,
    });
  });

  it("ignores a pick outside the cast, then takes the Directory's first free default", () => {
    expect(chooseLook({ paletteCount: 6, worn: wearing(3), picked: 9, directory })).toEqual({
      palette: 1,
      repeat: 0,
    });
  });

  it("wears the project's character again when every default is worn, as its next repeat", () => {
    const project = { characters: [3] };
    expect(
      chooseLook({ paletteCount: 6, worn: [{ palette: 3, repeat: 0 }], directory: project }),
    ).toEqual({ palette: 3, repeat: 1 });
    const twoCopies = [
      { palette: 3, repeat: 0 },
      { palette: 3, repeat: 1 },
    ];
    expect(chooseLook({ paletteCount: 6, worn: twoCopies, directory: project })).toEqual({
      palette: 3,
      repeat: 2,
    });
  });

  it('spreads the copies over several defaults', () => {
    expect(chooseLook({ paletteCount: 6, worn: wearing(1, 3), directory })).toEqual({
      palette: 3,
      repeat: 1,
    });
  });

  it('falls back to a random free character only when no default is left in the cast', () => {
    const look = chooseLook({
      paletteCount: 6,
      worn: wearing(1, 3),
      directory: { characters: [9] },
      random: () => 0,
    });
    expect(look).toEqual({ palette: 0, repeat: 0 });
  });

  it('a full cast repeats at random, as the next copy', () => {
    const look = chooseLook({ paletteCount: 2, worn: wearing(0, 1), random: () => 0.99 });
    expect(look).toEqual({ palette: 1, repeat: 1 });
  });
});

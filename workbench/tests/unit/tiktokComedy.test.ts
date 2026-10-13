import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TIKTOK_BIBLE,
  TIKTOK_STORIES,
  blenderStory,
  storyScript,
  tiktokComedyBrief,
} from '../../server/jev/studio/tiktokComedy';
import { IDEA_LIBRARY, ideaBrief, ideaText, newsIdeasPrompt } from '../../server/jev/studio/ideas';
import { storyMessages } from '../../server/jev/studio/story';
import { universeCharacter, universeSetOf } from '../../server/jev/studio/actor/universe';

/** Words as the bible counts them: tokens with a letter or a digit (« ! », « ? », « : » do not count). */
const words = (t: string) => t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
const POSES = new Set(['neutre', 'accuse', 'choc', 'haussement', 'rire']);

describe('BIBLE COMIQUE TIKTOK — les histoires écrites respectent leurs propres règles', () => {
  it('8 stories, 14–18 lines, every line ≤ 12 words, punchline ≤ 8 words, hook = conflict (no greeting)', () => {
    expect(TIKTOK_STORIES.length).toBeGreaterThanOrEqual(8);
    expect(new Set(TIKTOK_STORIES.map((s) => s.id)).size).toBe(TIKTOK_STORIES.length);
    for (const s of TIKTOK_STORIES) {
      expect(s.beats.length, s.id).toBeGreaterThanOrEqual(14);
      expect(s.beats.length, s.id).toBeLessThanOrEqual(18);
      for (const b of s.beats) expect(words(b.text), `${s.id}: ${b.text}`).toBeLessThanOrEqual(12);
      expect(words(s.beats[s.punch]!.text), `${s.id} punch`).toBeLessThanOrEqual(8);
      expect(s.punch).toBeGreaterThan(s.beats.length / 2);
      expect(s.beats[0]!.text).not.toMatch(/^(bonjour|bonsoir|salut)\b/i);
      expect(s.engine.length).toBeGreaterThan(10);
    }
  });
  it('the cast is the troupe of the channel, the poses exist, every speaker and reacting actor is on set', () => {
    for (const s of TIKTOK_STORIES) {
      const ids = new Set(s.cast.map((c) => c.id));
      for (const c of s.cast) {
        expect(universeCharacter(c.name), `${s.id}: ${c.name}`).not.toBeNull();
        expect(c.height).toBeGreaterThan(0.9);
        expect(c.height).toBeLessThan(2.1);
      }
      expect(universeSetOf(s.decor), `${s.id}: ${s.decor}`).not.toBeNull();
      for (const b of s.beats) {
        expect(ids.has(b.who), `${s.id}: ${b.who}`).toBe(true);
        expect(POSES.has(b.pose)).toBe(true);
        for (const [who, pose] of Object.entries(b.react ?? {})) {
          expect(ids.has(who)).toBe(true);
          expect(POSES.has(pose)).toBe(true);
        }
      }
      // Each cast member speaks at least once (nobody stands there for nothing).
      for (const c of s.cast)
        expect(
          s.beats.some((b) => b.who === c.id),
          `${s.id}: ${c.id} muet`,
        ).toBe(true);
    }
  });
  it('the Blender JSON shipped in scripts/blenderfilm/stories is exactly blenderStory() of the library', () => {
    for (const s of TIKTOK_STORIES) {
      const file = JSON.parse(
        readFileSync(join(__dirname, '../../scripts/blenderfilm/stories', `${s.id}.json`), 'utf8'),
      );
      expect(file).toEqual(JSON.parse(JSON.stringify(blenderStory(s))));
      expect(file.punch.beat).toBe(s.punch);
    }
  });
});

describe('LE PROMPTEUR reçoit les consignes', () => {
  it('the writer gets the whole bible, and keeps a supplied script word for word', () => {
    const plain = storyMessages({
      idea: 'Le prix du garba',
      durationSec: 60,
      language: 'fr',
      platform: 'tiktok',
      characters: [],
    })[1]!.content;
    expect(plain).toContain('BIBLE COMIQUE TIKTOK');
    for (const r of TIKTOK_BIBLE) expect(plain).toContain(r.rule);
    expect(plain).not.toContain('SCRIPT FOURNI');
    const scripted = storyMessages({
      idea: storyScript(TIKTOK_STORIES[0]!),
      durationSec: 60,
      language: 'fr',
      platform: 'tiktok',
      characters: [],
    })[1]!.content;
    expect(scripted).toContain('SCRIPT FOURNI');
    expect(scripted).toContain(TIKTOK_STORIES[0]!.beats[0]!.text);
    expect(tiktokComedyBrief().split('\n')).toHaveLength(TIKTOK_BIBLE.length + 1);
  });
  it('the news prompter gets the short rules; the written stories are in the library with their full script', () => {
    expect(newsIdeasPrompt(['Hausse du prix de l’attiéké'])).toMatch(
      /Règles comiques TikTok : accroche-conflit/,
    );
    const written = IDEA_LIBRARY.filter((i) => i.format === 'histoire');
    expect(written).toHaveLength(TIKTOK_STORIES.length);
    for (const i of written) {
      const s = TIKTOK_STORIES.find((t) => `tt-${t.id}` === i.id)!;
      expect(ideaText(i)).toBe(storyScript(s));
      for (const b of s.beats) expect(ideaText(i)).toContain(b.text);
      expect(ideaBrief(i)).toMatch(/MOT POUR MOT/);
      expect(i.punchline).toContain(s.beats[s.punch]!.text);
    }
  });
});

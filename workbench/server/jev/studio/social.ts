// Social Factory: prompt for the text model + strict validation of the pack (hook variants, caption with a "pick a side"
// question, 6–8 hashtags, thumbnail idea, CTA) and the mandatory AI-content reminder.
import { extractJson } from './story';
import type { Blueprint } from './types';
import { redactSecrets } from './secrets';

export const PLATFORMS = ['TikTok', 'Reels', 'Shorts', 'YouTube', 'Facebook'] as const;
export const AI_LABEL_REMINDER =
  'Rappel : activez l’étiquette « contenu généré par IA » sur TikTok avant de publier.';
export interface SocialPack {
  platform: string;
  hooks: string[];
  title: string;
  description: string;
  caption: string;
  hashtags: string[];
  thumbnail: string;
  cta: string;
  emojis: string[];
}
export function socialMessages(bp: Blueprint, platform: string) {
  return [
    {
      role: 'system' as const,
      content:
        'Tu es social media manager de sketchs humoristiques sénégalais. Réponds UNIQUEMENT par un JSON valide. Aucune marque réelle, aucune moquerie de groupe.',
    },
    {
      role: 'user' as const,
      content: `Plateforme : ${platform}. Titre : ${bp.title}. Résumé : ${redactSecrets(bp.story?.logline ?? bp.project.idea)}. Chute : ${bp.story?.punchline ?? ''}.
JSON : {"hooks":[3 variantes],"title","description","caption":"se termine par UNE question qui force à choisir un camp","hashtags":[6 à 8, sans #],"thumbnail":"idée de miniature","cta":"appel à l'action","emojis":[contextuels]}`,
    },
  ];
}
export function parseSocial(text: string, platform: string): { pack: SocialPack | null; issues: string[] } {
  const d = extractJson(text) as Record<string, unknown> | null;
  if (!d) return { pack: null, issues: ['aucun JSON valide'] };
  const str = (x: unknown) => (typeof x === 'string' ? x.trim() : '');
  const list = (x: unknown) => (Array.isArray(x) ? x.map(str).filter(Boolean) : []);
  const pack: SocialPack = {
    platform,
    hooks: list(d.hooks),
    title: str(d.title),
    description: str(d.description),
    caption: str(d.caption),
    hashtags: list(d.hashtags).map((h) => h.replace(/^#/, '')),
    thumbnail: str(d.thumbnail),
    cta: str(d.cta),
    emojis: list(d.emojis),
  };
  const issues: string[] = [];
  if (pack.hooks.length < 2) issues.push('au moins 2 variantes de hook attendues');
  if (!/\?\s*$/.test(pack.caption)) issues.push('la légende doit se terminer par une question');
  if (pack.hashtags.length < 6 || pack.hashtags.length > 8)
    issues.push(`${pack.hashtags.length} hashtags (6 à 8 attendus)`);
  return { pack, issues };
}

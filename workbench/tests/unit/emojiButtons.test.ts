// Émojis 3D des boutons de l'app : l'action du libellé choisit l'émoji (décoratif, CSS seulement).
import { describe, expect, it } from 'vitest';
import { emojiForLabel } from '../../direct/lib/emojiButtons';

describe('émoji 3D d’un bouton d’après son libellé', () => {
  it('les actions courantes ont leur émoji', () => {
    expect(emojiForLabel('Envoyer')).toBe('🚀');
    expect(emojiForLabel('Enregistrer')).toBe('💾');
    expect(emojiForLabel('Exporter en Excel')).toBe('📥');
    expect(emojiForLabel('Supprimer le chat')).toBe('🗑️');
    expect(emojiForLabel('Paramètres')).toBe('⚙️');
    expect(emojiForLabel('Exécuter')).toBe('▶️');
    expect(emojiForLabel('Vidéo')).toBe('🎬');
    expect(emojiForLabel('JEV : juger')).toBe('🧠');
  });
  it('rien quand aucun mot d’action ne correspond, ou pour un texte trop long', () => {
    expect(emojiForLabel('')).toBeNull();
    expect(emojiForLabel('zzz')).toBeNull();
    expect(emojiForLabel('x'.repeat(90))).toBeNull();
  });
});

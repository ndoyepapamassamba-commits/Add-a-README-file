// Émojis adaptatifs : le sens du titre et le domaine du rapport choisissent l'émoji 3D, sans doublon entre chapitres.
import { describe, expect, it } from 'vitest';
import { adaptiveEmoji, assignEmojis, detectDomain } from '../../server/assets/emojiLexicon';
import { buttonEmoji, setEmojiContext, topicEmoji } from '../../server/services/dossier/cacSkin';

describe('émojis adaptatifs selon le reporting', () => {
  it('le domaine du rapport est détecté (crédit, ventes, RH, santé, énergie)', () => {
    expect(detectDomain('Covenants, impayés et provisions IFRS 9 du portefeuille de crédit')).toBe('credit');
    expect(detectDomain('Ventes par magasin, chiffre d’affaires et panier client')).toBe('ventes');
    expect(detectDomain('Effectif, recrutement et formation des salariés')).toBe('rh');
    expect(detectDomain('Patients, hôpital et soins')).toBe('sante');
    expect(detectDomain('Production solaire et électricité')).toBe('energie');
  });
  it('le sens du titre choisit l’émoji, dans n’importe quel domaine', () => {
    expect(adaptiveEmoji('Assurances échues')).toBe('🛡️');
    expect(adaptiveEmoji('Chiffre d’affaires par région')).toBe('💰');
    expect(adaptiveEmoji('Recrutement et effectifs')).toBe('👔');
    expect(adaptiveEmoji('Livraisons et transport')).toBe('🚚');
    expect(adaptiveEmoji('Récolte de la campagne agricole')).toBe('🌾');
    expect(adaptiveEmoji('zzz')).toBeNull();
  });
  it('les chapitres d’un même rapport ont des émojis différents', () => {
    const e = assignEmojis(['Ventes du trimestre', 'Ventes par canal', 'Ventes par produit'], 'ventes');
    expect(new Set(e).size).toBe(3);
  });
  it('les exports suivent le rapport : le même mot change d’émoji selon le domaine quand il n’a pas de sens propre', () => {
    setEmojiContext({
      title: 'Ventes et clients des magasins',
      chapters: [{ title: 'Synthèse commerciale' }, { title: 'Divers' }],
    });
    expect(buttonEmoji('Ouvrir')).toBe('📂');
    expect(topicEmoji('Synthèse commerciale')).toBeTruthy();
    const a = buttonEmoji('Divers', 0);
    setEmojiContext({ title: 'Patients et soins à l’hôpital', chapters: [{ title: 'Divers' }] });
    const b = buttonEmoji('Divers', 0);
    setEmojiContext(null);
    expect(a).not.toBe(b);
  });
});

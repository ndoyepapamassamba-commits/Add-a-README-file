// Sous-agents automatiques : JEV mesure la charge et prescrit un découpage en sous-agents parallèles.
import { describe, expect, it } from 'vitest';
import { enumeratedParts, swarmBlock, swarmPlan } from '../../server/jev/swarm';

describe('JEV découpe les tâches lourdes en sous-agents', () => {
  it('une demande courte et simple reste à un seul agent', () => {
    const p = swarmPlan({ text: 'Résume ce fichier', complexity: 0.2, outputs: ['résumé'] });
    expect(p.heavy).toBe(false);
    expect(swarmBlock(p, [])).toBe('');
  });
  it('une demande à plusieurs parties et livrables est découpée (2 à 4 sous-tâches, en parallèle)', () => {
    const text = 'Pour le comité :\n1. analyse les impayés par segment\n2. calcule les provisions IFRS 9\n3. prépare le deck de 10 diapositives\n4. rédige la note au DG\n5. vérifie la cohérence des chiffres';
    expect(enumeratedParts(text)).toHaveLength(5);
    const p = swarmPlan({ text, complexity: 0.7, outputs: ['xlsx', 'pptx', 'docx'], attachments: 2 });
    expect(p.heavy).toBe(true);
    expect(p.parts).toHaveLength(4);
    const b = swarmBlock(p, ['analyst', 'designer']);
    expect(b).toContain('agent.delegate ONCE PER SUB-TASK IN THE SAME TURN');
    expect(b).toContain('1. analyse les impayés par segment');
  });
  it('sans énumération, les livrables deviennent les sous-tâches', () => {
    const p = swarmPlan({ text: 'x'.repeat(1600), complexity: 0.8, outputs: ['xlsx', 'pptx'] });
    expect(p.heavy).toBe(true);
    expect(p.parts[0]).toContain('xlsx');
  });
});

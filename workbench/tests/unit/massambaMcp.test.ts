import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { analyseFile, buildServer, committeePack } from '../../server/mcp/massamba';

// Synthetic portfolio only (never the user's data).
function csv(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'massamba-mcp-'));
  const f = path.join(dir, 'portefeuille.csv');
  const rows = ['Code Client,Relationship,Encours total (XOF),Provisions IFRS9 (XOF),Impayés PDO (XOF)'];
  for (let i = 0; i < 10; i++) rows.push(`${1000 + i},CLIENT ${String.fromCharCode(65 + i)} SA,${Math.round(2e9 / (i + 1))},${Math.round(2e7 / (i + 1))},${i % 3 === 0 ? Math.round(5e8 / (i + 1)) : 0}`);
  fs.writeFileSync(f, rows.join('\n'));
  return f;
}

describe('v63 — serveur MCP « massamba » (JEV dans Claude)', () => {
  it('expose les 8 outils de JEV, lecture seule marquée', async () => {
    const [a, b] = InMemoryTransport.createLinkedPair();
    const server = buildServer();
    await server.connect(a);
    const client = new Client({ name: 't', version: '1' });
    await client.connect(b);
    const tools = (await client.listTools()).tools;
    expect(tools.map((t) => t.name).sort()).toEqual(['jev_analyse_fichier', 'jev_bibliotheque', 'jev_dossier_comite', 'jev_fiche_entite', 'jev_lire_page', 'jev_prepublications', 'jev_recherche_web', 'jev_taux_bce']);
    expect(tools.find((t) => t.name === 'jev_analyse_fichier')?.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === 'jev_dossier_comite')?.annotations?.readOnlyHint).toBe(false);
    const r = await client.callTool({ name: 'jev_analyse_fichier', arguments: { path: csv() } });
    expect(JSON.stringify(r.content)).toContain('aucune donnée envoyée');
    await client.close();
  });
  it('analyse locale et dossier comité écrits à côté du fichier (xlsx, docx, pptx)', () => {
    const f = csv();
    expect(analyseFile(f)).toContain('10 ligne(s)');
    const out = committeePack(f, undefined, 'Top 10 test');
    const dir = path.join(path.dirname(f), 'Top 10 test — dossier comité');
    for (const ext of ['classeur.xlsx', 'rapport.docx', 'deck.pptx']) {
      const p = path.join(dir, `Top 10 test — ${ext}`);
      expect(fs.existsSync(p)).toBe(true);
      expect(fs.readFileSync(p).subarray(0, 2).toString()).toBe('PK');
    }
    expect(out).toContain('aucune donnée envoyée');
  });
});

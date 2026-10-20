import fsp from 'node:fs/promises';
import { extractDocumentBytes, type ExtractedDocument } from './documentsCore';

export * from './documentsCore';

/** Extracts readable text from PDF, Word, PowerPoint, ODT, HTML and RTF files. */
export async function extractDocumentText(absPath: string): Promise<ExtractedDocument> {
  return extractDocumentBytes(absPath, new Uint8Array(await fsp.readFile(absPath)));
}

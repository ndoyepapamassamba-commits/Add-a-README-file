// Document text extraction from bytes (no Node APIs: shared with the standalone client).
import { extOf } from './dataCore';
import { unzipSync, strFromU8 } from 'fflate';

export const DOCUMENT_EXTENSIONS = ['.pdf', '.docx', '.pptx', '.odt', '.html', '.htm', '.rtf'];
export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];

export function isDocument(p: string): boolean {
  return DOCUMENT_EXTENSIONS.includes(extOf(p));
}
export function isImage(p: string): boolean {
  return IMAGE_EXTENSIONS.includes(extOf(p));
}

export function mimeFor(p: string): string {
  const ext = extOf(p);
  return (
    (
      {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
        '.svg': 'image/svg+xml',
        '.pdf': 'application/pdf',
        '.html': 'text/html; charset=utf-8',
        '.htm': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.mjs': 'text/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.md': 'text/markdown; charset=utf-8',
        '.txt': 'text/plain; charset=utf-8',
        '.csv': 'text/csv; charset=utf-8',
        '.xml': 'application/xml; charset=utf-8',
        '.yaml': 'text/yaml; charset=utf-8',
        '.yml': 'text/yaml; charset=utf-8',
        '.zip': 'application/zip',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.xls': 'application/vnd.ms-excel',
        '.xlsm': 'application/vnd.ms-excel.sheet.macroEnabled.12',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.woff2': 'font/woff2',
        '.woff': 'font/woff',
        '.ico': 'image/x-icon',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
      } as Record<string, string>
    )[ext] ?? 'application/octet-stream'
  );
}

function stripXml(xml: string): string {
  return xml
    .replace(/<\/(w:p|a:p|text:p|text:h)>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface ExtractedDocument {
  kind: string;
  text: string;
  pages?: number;
}

/** Extracts readable text from PDF, Word, PowerPoint, ODT, HTML and RTF files. */
export async function extractDocumentBytes(name: string, buf: Uint8Array): Promise<ExtractedDocument> {
  const ext = extOf(name);
  const decode = (enc = 'utf-8') => new TextDecoder(enc).decode(buf);
  if (ext === '.pdf') {
    const { getDocumentProxy, extractText } = await import('unpdf');
    const pdf = await getDocumentProxy(buf);
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const pages = Array.isArray(text) ? text : [text];
    return {
      kind: 'pdf',
      pages: totalPages,
      text: pages.map((t, i) => `--- page ${i + 1} ---\n${t.trim()}`).join('\n\n'),
    };
  }
  if (ext === '.docx') {
    const mammoth = await import('mammoth');
    const res = await mammoth.extractRawText(
      typeof window === 'undefined'
        ? { buffer: Buffer.from(buf) }
        : ({ arrayBuffer: buf.slice().buffer } as unknown as { buffer: Buffer }),
    );
    return { kind: 'docx', text: res.value.trim() };
  }
  if (ext === '.pptx') {
    const files = unzipSync(buf, {
      filter: (f) => /^ppt\/slides\/slide\d+\.xml$/.test(f.name),
    });
    const slides = Object.keys(files).sort((a, b) => Number(/\d+/.exec(a)?.[0]) - Number(/\d+/.exec(b)?.[0]));
    return {
      kind: 'pptx',
      pages: slides.length,
      text: slides.map((s, i) => `--- slide ${i + 1} ---\n${stripXml(strFromU8(files[s]!))}`).join('\n\n'),
    };
  }
  if (ext === '.odt') {
    const files = unzipSync(buf, { filter: (f) => f.name === 'content.xml' });
    return { kind: 'odt', text: files['content.xml'] ? stripXml(strFromU8(files['content.xml'])) : '' };
  }
  if (ext === '.html' || ext === '.htm') {
    const html = decode();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n');
    return { kind: 'html', text: stripXml(text) };
  }
  if (ext === '.rtf') {
    const text = decode('latin1')
      .replace(/\\par[d]?/g, '\n')
      .replace(/\{\\\*[^}]*\}|\\[a-z]+-?\d* ?|[{}]/g, '')
      .trim();
    return { kind: 'rtf', text };
  }
  throw new Error(`Unsupported document type: ${ext}`);
}

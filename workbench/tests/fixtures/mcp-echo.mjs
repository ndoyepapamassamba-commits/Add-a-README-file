// Minimal stdio MCP server used by the integration tests.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';

const server = new McpServer(
  { name: 'echo-fixture', version: '1.0.0' },
  { instructions: 'Serveur de test : utilisez echo pour répéter un texte.' },
);

server.registerTool(
  'echo',
  {
    description: 'Répète le texte reçu',
    inputSchema: { text: z.string() },
    annotations: { readOnlyHint: true },
  },
  async ({ text }) => ({
    content: [{ type: 'text', text: `echo: ${text}` }],
  }),
);

server.registerTool(
  'env_check',
  { description: 'Indique si des secrets du serveur ont fuité dans l’environnement', inputSchema: {} },
  async () => ({
    content: [
      {
        type: 'text',
        text:
          process.env.OPENROUTER_API_KEY || process.env.WORKBENCH_AUTH_TOKEN
            ? 'LEAK'
            : `clean ${process.env.FIXTURE_VAR ?? ''}`.trim(),
      },
    ],
  }),
);

server.registerTool(
  'make_image',
  { description: 'Renvoie une image PNG', inputSchema: {}, annotations: { destructiveHint: false } },
  async () => ({
    content: [{ type: 'image', data: PNG_1PX, mimeType: 'image/png' }],
  }),
);

server.registerTool('fail', { description: 'Échoue toujours', inputSchema: {} }, async () => ({
  content: [{ type: 'text', text: 'boom' }],
  isError: true,
}));

await server.connect(new StdioServerTransport());

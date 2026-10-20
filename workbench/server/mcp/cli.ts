// Entry point of the « massamba » MCP server (stdio): `node massamba-mcp.mjs`.
import { main } from './massamba';

main().catch((e: unknown) => {
  process.stderr.write(`massamba-mcp : ${(e as Error).message ?? String(e)}\n`);
  process.exit(1);
});

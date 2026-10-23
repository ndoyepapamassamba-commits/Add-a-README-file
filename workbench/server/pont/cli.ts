// Entry point of the local bridge: `node massamba-pont.mjs [dossier] [--port 7821] [--code XXXX] [--sans-shell]`.
import { main } from './pont';

main().catch((e: unknown) => {
  process.stderr.write(`massamba-pont : ${(e as Error).message ?? String(e)}\n`);
  process.exit(1);
});

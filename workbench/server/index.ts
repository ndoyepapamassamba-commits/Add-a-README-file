import { buildApp } from './app';
import { isLoopbackHost, loadConfig } from './config';
import { buildPreviewServer } from './http/preview';

async function main(): Promise<void> {
  const config = loadConfig();
  if (!isLoopbackHost(config.host) && !config.authToken) {
    console.error(`Refusing to listen on ${config.host} without WORKBENCH_AUTH_TOKEN. Set a strong token in .env or use HOST=127.0.0.1.`);
    process.exit(1);
  }
  const { app, ctx } = await buildApp(config);
  const preview = buildPreviewServer(ctx);

  await app.listen({ host: config.host, port: config.port });
  await preview.listen({ host: config.host, port: config.previewPort });

  const base = `http://${config.host === '0.0.0.0' ? '127.0.0.1' : config.host}:${config.port}`;
  const keyState = process.env.OPENROUTER_API_KEY ? 'configurée' : 'NON configurée (OPENROUTER_API_KEY)';
  const lines = [
    '',
    '  ◆ OpenRouter AI Workbench',
    `  ─ Interface        ${base}/#token=${ctx.authToken}`,
    `  ─ Fichier HTML     dist/openrouter-workbench.html (serveur : ${base})`,
    `  ─ Jeton d'accès    ${ctx.authToken}  (aussi dans data/.workbench-token)`,
    `  ─ Projets          ${config.workspaceRoot}`,
    `  ─ Clé OpenRouter   ${keyState}`,
    `  ─ Navigateur       ${config.browserEngine}${ctx.services.browser.isAvailable() ? '' : ' (non installé : npx playwright install ' + config.browserEngine + ')'}`,
    '',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);

  void ctx.services.catalog.list().catch((err: Error) => app.log.warn(`model catalog unavailable: ${err.message}`));
  void ctx.services.jev.check().then((j) => app.log.info(`Jev (TypeSafe): ${j.ok ? `available (${j.model})` : `unavailable — ${j.error}`}`));
  if (ctx.services.settings.get().mcp.autoConnect) void ctx.services.mcp.ensureConnected();

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received, shutting down`);
    for (const id of ctx.orchestrator.activeRuns()) ctx.orchestrator.cancel(id);
    await Promise.allSettled([app.close(), preview.close()]);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

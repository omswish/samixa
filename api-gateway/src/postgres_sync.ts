import dotenv from 'dotenv';
import path from 'path';
import { getDashboardStateMirrorPayload } from './db';
import { closePostgresMirror, isPostgresMirrorEnabled, syncDashboardStateToPostgresNow } from './postgres';
import { ensureCollectorTargetConfigBootstrap } from './runtimeConfig';
import { ensureCollectorSecretConfigBootstrap } from './runtimeSecrets';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
  if (!isPostgresMirrorEnabled()) {
    throw new Error('POSTGRES_URL is not configured. Set POSTGRES_URL before running the Postgres sync.');
  }

  await ensureCollectorTargetConfigBootstrap();
  await ensureCollectorSecretConfigBootstrap();
  const payload = getDashboardStateMirrorPayload();
  await syncDashboardStateToPostgresNow(payload);
  console.log(`[postgres-sync] mirrored dashboard state captured at ${payload.capturedAt}`);
}

main()
  .catch((error) => {
    console.error('[postgres-sync] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePostgresMirror();
  });

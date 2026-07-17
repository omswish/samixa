const fs = require('fs');
const path = require('path');

function parseDotEnv(content) {
  const result = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function getSslConfig(value) {
  if (!value) {
    return false;
  }

  return /^(1|true|require)$/i.test(value)
    ? { rejectUnauthorized: false }
    : false;
}

async function main() {
  const appRoot = process.argv[2];
  if (!appRoot) {
    throw new Error('Usage: validate-postgres.js <appRoot>');
  }

  const envPath = path.join(appRoot, '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error(`.env not found at ${envPath}`);
  }

  const env = parseDotEnv(fs.readFileSync(envPath, 'utf8'));
  if (!env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL is missing from .env');
  }

  const pg = require(path.join(appRoot, 'node_modules', 'pg'));
  const client = new pg.Client({
    connectionString: env.POSTGRES_URL,
    ssl: getSslConfig(env.POSTGRES_SSL),
    connectionTimeoutMillis: 5000
  });

  try {
    await client.connect();
    const result = await client.query('select current_database() as database_name, current_user as user_name');
    const row = result.rows[0] || {};
    process.stdout.write(JSON.stringify({
      ok: true,
      database: row.database_name || null,
      user: row.user_name || null
    }));
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((error) => {
  process.stderr.write(error.message || String(error));
  process.exit(1);
});

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const envPath = path.join(__dirname, '..', '.env');
const env = fs.readFileSync(envPath, 'utf8');
const line = env.split(/\r?\n/).find((entry) => /^DATABASE_URL=/.test(entry));

if (!line) {
  throw new Error('DATABASE_URL is missing from backend/.env');
}

const rawUrl = line.slice('DATABASE_URL='.length).trim().replace(/^['"]|['"]$/g, '');
const url = new URL(rawUrl);
const user = decodeURIComponent(url.username);
const password = decodeURIComponent(url.password);
const database = url.pathname.slice(1);

const quoteIdentifier = (value) => `"${value.replace(/"/g, '""')}"`;
const quoteLiteral = (value) => `'${value.replace(/'/g, "''")}'`;
const redact = (value) => value.split(password).join('<redacted>');

function runPsql(args, input) {
  const result = spawnSync('sudo', ['-u', 'postgres', 'psql', ...args], {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (result.stdout) process.stdout.write(redact(result.stdout));
  if (result.stderr) process.stderr.write(redact(result.stderr));
  if (result.status !== 0) process.exit(result.status || 1);
}

function readPsql(args) {
  const result = spawnSync('sudo', ['-u', 'postgres', 'psql', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    if (result.stderr) process.stderr.write(redact(result.stderr));
    process.exit(result.status || 1);
  }

  return result.stdout.trim();
}

runPsql(
  ['-v', 'ON_ERROR_STOP=1', '-d', 'postgres'],
  `
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = ${quoteLiteral(user)}) THEN
    EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L CREATEDB', ${quoteLiteral(user)}, ${quoteLiteral(password)});
  ELSE
    EXECUTE format('CREATE ROLE %I WITH LOGIN PASSWORD %L CREATEDB', ${quoteLiteral(user)}, ${quoteLiteral(password)});
  END IF;
END
$$;
`,
);

const databaseExists = readPsql([
  '-tAc',
  `SELECT 1 FROM pg_database WHERE datname = ${quoteLiteral(database)}`,
]);

if (!databaseExists) {
  runPsql(
    ['-v', 'ON_ERROR_STOP=1', '-d', 'postgres'],
    `CREATE DATABASE ${quoteIdentifier(database)} OWNER ${quoteIdentifier(user)};`,
  );
}

runPsql(
  ['-v', 'ON_ERROR_STOP=1', '-d', database],
  `
GRANT ALL PRIVILEGES ON DATABASE ${quoteIdentifier(database)} TO ${quoteIdentifier(user)};
GRANT USAGE, CREATE ON SCHEMA public TO ${quoteIdentifier(user)};
ALTER SCHEMA public OWNER TO ${quoteIdentifier(user)};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${quoteIdentifier(user)};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${quoteIdentifier(user)};
`,
);

console.log('Local PostgreSQL role/database now match backend/.env.');

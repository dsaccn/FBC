import { Pool } from 'pg';
import * as fs from 'fs';

const envPath = './.env';
const envFile = fs.readFileSync(envPath, 'utf8');
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    let val = match[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
});

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT id, status, "createdAt" FROM "Order" ORDER BY "createdAt" DESC');
    console.log("Cloud orders:", res.rows);
  } finally {
    client.release();
    await pool.end();
  }
}
run().catch(console.error);

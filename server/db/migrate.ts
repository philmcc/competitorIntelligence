import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { neon } from '@neondatabase/serverless';
import { mkdir } from 'fs/promises';
import { join } from 'path';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

async function ensureMigrationsMetaExists() {
  try {
    await mkdir(join(process.cwd(), 'server', 'db', 'migrations', 'meta'), { recursive: true });
  } catch (error) {
    // Ignore if directory already exists
  }
}

async function main() {
  try {
    await ensureMigrationsMetaExists();
    await migrate(db, { migrationsFolder: 'server/db/migrations' });
    console.log('Migration complete');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

main(); 
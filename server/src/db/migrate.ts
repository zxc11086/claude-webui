import db from './index.js';

console.log('[DB Migrate] Starting migration...');

// Add role column to users table if it doesn't exist
try {
  db.exec(`
    ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
  `);
  console.log('[DB Migrate] Added role column to users table');
} catch (err: any) {
  if (err.message.includes('duplicate column name')) {
    console.log('[DB Migrate] Role column already exists, skipping');
  } else {
    console.error('[DB Migrate] Error adding role column:', err.message);
  }
}

// Add title column to sessions table if it doesn't exist
try {
  db.exec(`
    ALTER TABLE sessions ADD COLUMN title TEXT;
  `);
  console.log('[DB Migrate] Added title column to sessions table');
} catch (err: any) {
  if (err.message.includes('duplicate column name')) {
    console.log('[DB Migrate] Title column already exists, skipping');
  } else {
    console.error('[DB Migrate] Error adding title column:', err.message);
  }
}

console.log('[DB Migrate] Migration completed');
process.exit(0);

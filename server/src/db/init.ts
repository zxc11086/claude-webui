import db from './index.js';

console.log('[DB Init] Database initialized successfully.');
console.log('[DB Init] Tables created: workspaces, sessions, messages');

// Verify
const tables = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
).all();
console.log('[DB Init] Existing tables:', tables.map((t: any) => t.name).join(', '));

process.exit(0);

import db from './index.js';
import { User } from '../types/index.js';

export function createUser(user: User): User {
  const stmt = db.prepare(`
    INSERT INTO users (id, email, password_hash, role, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(user.id, user.email, user.passwordHash, user.role, user.createdAt);
  return user;
}

export function getUserByEmail(email: string): User | undefined {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
  if (!row) return undefined;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role || 'user',
    createdAt: row.created_at,
  };
}

export function getUserById(id: string): User | undefined {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
  if (!row) return undefined;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role || 'user',
    createdAt: row.created_at,
  };
}

export function getAllUsers(): User[] {
  const rows = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as any[];
  return rows.map(row => ({
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role || 'user',
    createdAt: row.created_at,
  }));
}

export function deleteUser(id: string): void {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

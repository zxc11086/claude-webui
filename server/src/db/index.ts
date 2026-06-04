import Database, { Database as DatabaseType } from 'better-sqlite3';
import { config } from '../config.js';
import { Session, Message, Workspace } from '../types/index.js';
import fs from 'fs';
import path from 'path';

const dbDir = path.dirname(config.dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db: DatabaseType = new Database(config.dbPath);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Schema ---

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );

  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'default',
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    title TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE TABLE IF NOT EXISTS shared_conversations (
    id TEXT PRIMARY KEY,
    messages TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    expires_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_workspaces_user ON workspaces(user_id);
  CREATE INDEX IF NOT EXISTS idx_shared_expires ON shared_conversations(expires_at);
`);

// --- Workspace queries ---

export function createWorkspace(workspace: Workspace): Workspace {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO workspaces (id, user_id, name, path, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(workspace.id, workspace.userId, workspace.name, workspace.path, workspace.createdAt);

  const wsDir = path.resolve(config.workspacesRoot, workspace.userId, workspace.name);
  if (!fs.existsSync(wsDir)) {
    fs.mkdirSync(wsDir, { recursive: true });
  }

  return workspace;
}

export function getWorkspace(id: string): Workspace | undefined {
  const row = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as any;
  if (!row) return undefined;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    path: row.path,
    createdAt: row.created_at,
  };
}

export function getWorkspacesByUser(userId: string): Workspace[] {
  const rows = db.prepare('SELECT * FROM workspaces WHERE user_id = ? ORDER BY created_at DESC').all(userId) as any[];
  return rows.map(row => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    path: row.path,
    createdAt: row.created_at,
  }));
}

// --- Session queries ---

export function createSession(session: Session): Session {
  const stmt = db.prepare(`
    INSERT INTO sessions (id, workspace_id, status, title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(session.id, session.workspaceId, session.status, session.title || null, session.createdAt, session.updatedAt);
  return session;
}

export function getSession(id: string): Session | undefined {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any;
  if (!row) return undefined;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    status: row.status,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function updateSessionStatus(id: string, status: Session['status']): void {
  db.prepare('UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, Date.now(), id);
}

export function updateSessionTitle(id: string, title: string): void {
  db.prepare('UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?')
    .run(title, Date.now(), id);
}

export function getSessionsByWorkspace(workspaceId: string): Session[] {
  const rows = db.prepare(
    'SELECT * FROM sessions WHERE workspace_id = ? AND status != \'closed\' ORDER BY updated_at DESC LIMIT 50'
  ).all(workspaceId) as any[];
  return rows.map(row => ({
    id: row.id,
    workspaceId: row.workspace_id,
    status: row.status,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

// --- Message queries ---

export function createMessage(message: Message): Message {
  const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
  const stmt = db.prepare(`
    INSERT INTO messages (id, session_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(message.id, message.sessionId, message.role, content, message.createdAt);
  return message;
}

export function getMessagesBySession(sessionId: string, limit = 200): Message[] {
  const rows = db.prepare(
    'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ?'
  ).all(sessionId, limit) as any[];
  return rows.map(row => {
    let content = row.content;
    try { content = JSON.parse(content); } catch { /* keep as string */ }
    return {
      id: row.id,
      sessionId: row.session_id,
      role: row.role,
      content,
      createdAt: row.created_at,
    };
  });
}

// --- Shared conversation queries ---

export function createSharedConversation(id: string, messages: any[]): void {
  const stmt = db.prepare(`
    INSERT INTO shared_conversations (id, messages, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `);
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  stmt.run(id, JSON.stringify(messages), Date.now(), expiresAt);
}

export function getSharedConversation(id: string): any[] | null {
  const row = db.prepare(
    'SELECT messages, expires_at FROM shared_conversations WHERE id = ?'
  ).get(id) as any;
  
  if (!row) return null;
  
  // Check if expired
  if (row.expires_at && row.expires_at < Date.now()) {
    db.prepare('DELETE FROM shared_conversations WHERE id = ?').run(id);
    return null;
  }
  
  return JSON.parse(row.messages);
}

export default db;

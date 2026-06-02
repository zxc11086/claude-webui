import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..', '..');

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',

  // Workspace root for user isolation
  workspacesRoot: process.env.WORKSPACES_ROOT || path.join(ROOT_DIR, 'workspaces'),

  // Database
  dbPath: process.env.DB_PATH || path.join(ROOT_DIR, 'data', 'claude-webui.db'),

  // Claude CLI
  claudePath: process.env.CLAUDE_PATH || 'claude',

  // Session limits
  sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '86400000', 10), // 24 hours
  maxSessionsPerUser: parseInt(process.env.MAX_SESSIONS || '5', 10),

  // Skip all permission prompts (passes --dangerously-skip-permissions to Claude CLI)
  dangerouslySkipPermissions: process.env.DANGEROUSLY_SKIP_PERMISSIONS !== 'false',

  // Process limits
  processHeartbeatInterval: 30000, // 30s
  processCleanupInterval: 60000,   // 60s

  // CORS — 默认允许所有来源，生产环境可设 CORS_ORIGIN 限定
  corsOrigin: process.env.CORS_ORIGIN === 'false'
    ? false
    : process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN
      : true,

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
};

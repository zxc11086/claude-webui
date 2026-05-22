// --- Database Models ---

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'user';
  createdAt: number;
}

export interface Workspace {
  id: string;
  userId: string;
  name: string;
  path: string;
  createdAt: number;
}

export interface Session {
  id: string;
  workspaceId: string;
  status: 'active' | 'idle' | 'closed';
  title?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  createdAt: number;
}

// --- Runtime Events ---

export interface RuntimeEvent {
  id: string;
  sessionId: string;
  type: RuntimeEventType;
  payload: any;
  createdAt: number;
}

export type RuntimeEventType =
  | 'session.started'
  | 'session.closed'
  | 'user.message'
  | 'assistant.delta'
  | 'assistant.completed'
  | 'tool.call'
  | 'tool.stdout'
  | 'tool.stderr'
  | 'tool.result'
  | 'file.updated'
  | 'task.updated'
  | 'error';

// --- Auth ---

export interface AuthPayload {
  userId: string;
  email: string;
  role: 'admin' | 'user';
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    role: 'admin' | 'user';
  };
}

// --- WebSocket Protocol ---

// Client → Server
export type ClientEvent =
  | { type: 'chat.send'; sessionId: string; content: string }
  | { type: 'session.create'; workspaceId: string }
  | { type: 'session.resume'; sessionId: string };

// Server → Client
export type ServerEvent =
  | { type: 'session.created'; sessionId: string; workspaceId: string }
  | { type: 'session.resumed'; sessionId: string; messages: Message[] }
  | { type: 'session.closed'; sessionId: string }
  | { type: 'assistant.delta'; sessionId: string; delta: string }
  | { type: 'assistant.completed'; sessionId: string; messageId: string }
  | { type: 'tool.call'; sessionId: string; toolId: string; tool: string; input: any }
  | { type: 'tool.stdout'; sessionId: string; toolId: string; stream: 'stdout' | 'stderr'; delta: string }
  | { type: 'tool.result'; sessionId: string; toolId: string; result: any }
  | { type: 'error'; sessionId: string; message: string }
  | { type: 'file.updated'; sessionId: string; path: string; patch: string };

// --- Stream-JSON Types (Claude CLI raw output) ---

export interface ClaudeStreamEvent {
  type: string;
  [key: string]: any;
}

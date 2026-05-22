// --- Domain types (mirrors server types) ---

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

// --- UI Message (enriched for display) ---

export interface UIMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  createdAt: number;
  isStreaming?: boolean;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  toolId: string;
  tool: string;
  input: any;
  output?: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  streams?: { stream: 'stdout' | 'stderr'; text: string }[];
}

// --- WebSocket event types (client-side) ---

export interface ServerToClientEvents {
  'session.created': (data: { sessionId: string; workspaceId: string; workspacePath: string }) => void;
  'session.resumed': (data: { sessionId: string; messages: Message[] }) => void;
  'session.closed': (data: { sessionId: string; reason?: string }) => void;
  'session.started': (data: { sessionId: string; workspacePath: string }) => void;
  'user.message': (data: { id: string; sessionId: string; content: string; createdAt: number }) => void;
  'assistant.delta': (data: { sessionId: string; delta: string }) => void;
  'assistant.completed': (data: { sessionId: string }) => void;
  'tool.call': (data: { sessionId: string; toolId: string; tool: string; input: any }) => void;
  'tool.stdout': (data: { sessionId: string; toolId: string; stream: string; delta: string }) => void;
  'tool.result': (data: { sessionId: string; toolId: string; result: any }) => void;
  'tool.stderr': (data: { sessionId: string; toolId: string; delta: string }) => void;
  'file.updated': (data: { sessionId: string; path: string; patch: string }) => void;
  'error': (data: { sessionId: string; message: string }) => void;
  'workspace.init': (data: { workspaceId: string; sessions: Session[] }) => void;
}

import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useChatStore } from '../stores/chat-store';
import { ServerToClientEvents, ToolCall, Session } from '../types/index';

const SOCKET_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3001';

export function useWebSocket() {
  const socketRef = useRef<Socket | null>(null);
  const store = useChatStore;

  useEffect(() => {
    const socket: Socket<ServerToClientEvents> = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      store.getState().setConnected(true);
      console.log('[WS] Connected:', socket.id);
    });

    socket.on('disconnect', () => {
      store.getState().setConnected(false);
      console.log('[WS] Disconnected');
    });

    // --- Workspace init ---
    socket.on('workspace.init', (data: { workspaceId: string; sessions: Session[] }) => {
      store.getState().setWorkspace(data.workspaceId);
      store.getState().setSessions(data.sessions);
    });

    // --- Session events ---
    socket.on('session.created', (data: { sessionId: string; workspaceId: string; workspacePath: string }) => {
      store.getState().setActiveSession(data.sessionId);
      store.getState().resetChat();
      // Refresh sessions list
      fetchSessions(store, socket);
    });

    socket.on('session.resumed', (data: { sessionId: string; messages: any[] }) => {
      store.getState().setActiveSession(data.sessionId);
      store.getState().resetChat();
      // Load historical messages
      for (const msg of data.messages) {
        store.getState().addMessage({
          id: msg.id,
          role: msg.role,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
          createdAt: msg.createdAt,
        });
      }
    });

    socket.on('session.closed', () => {
      store.getState().setActiveSession(null);
      store.getState().resetChat();
    });

    // --- User message echo ---
    socket.on('user.message', (data: { id: string; sessionId: string; content: string; createdAt: number }) => {
      store.getState().addMessage({
        id: data.id,
        role: 'user',
        content: data.content,
        createdAt: data.createdAt,
      });
    });

    // --- Assistant streaming ---
    socket.on('assistant.delta', (data: { sessionId: string; delta: string }) => {
      store.getState().appendDelta(data.delta);
    });

    // --- Tool calls ---
    socket.on('tool.call', (data: { sessionId: string; toolId: string; tool: string; input: any }) => {
      store.getState().addToolCall({
        toolId: data.toolId,
        tool: data.tool,
        input: data.input,
        status: 'pending',
        streams: [],
      });
    });

    socket.on('tool.stdout', (data: { sessionId: string; toolId: string; stream: string; delta: string }) => {
      store.getState().updateToolCall(data.toolId, { status: 'running' });
      store.getState().appendToolOutput(
        data.toolId,
        data.stream as 'stdout' | 'stderr',
        data.delta,
      );
    });

    socket.on('tool.stderr', (data: { sessionId: string; toolId: string; delta: string }) => {
      store.getState().updateToolCall(data.toolId, { status: 'running' });
      store.getState().appendToolOutput(data.toolId, 'stderr', data.delta);
    });

    socket.on('tool.result', (data: { sessionId: string; toolId: string; result: any }) => {
      const resultStr = typeof data.result === 'string' ? data.result : JSON.stringify(data.result, null, 2);
      store.getState().updateToolCall(data.toolId, {
        status: 'completed',
        output: resultStr,
      });
      // Auto-finish streaming after tool result
      // (Claude sends content after tool results)
    });

    // --- Approval ---
    socket.on('approval.request', (data: any) => {
      store.getState().setPendingApproval({
        requestId: data.requestId,
        sessionId: data.sessionId,
        tool: data.tool,
        input: data.input,
        message: data.message,
      });
    });

    // --- Error ---
    socket.on('error', (data: { sessionId: string; message: string }) => {
      store.getState().addMessage({
        id: `err-${Date.now()}`,
        role: 'system',
        content: `Error: ${data.message}`,
        createdAt: Date.now(),
      });
    });

    // --- File updated ---
    socket.on('file.updated', (data: { sessionId: string; path: string; patch: string }) => {
      store.getState().addMessage({
        id: `file-${Date.now()}`,
        role: 'tool',
        content: `File updated: ${data.path}`,
        createdAt: Date.now(),
      });
    });

    // --- Session started ---
    socket.on('session.started', (data: { sessionId: string; workspacePath: string }) => {
      console.log('[WS] Session started:', data.sessionId);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const sendMessage = (content: string, sessionId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('chat.send', { sessionId, content });
    }
  };

  const createSession = (workspaceId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('session.create', { workspaceId });
    }
  };

  const resumeSession = (sessionId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('session.resume', { sessionId });
    }
  };

  const closeSession = (sessionId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('session.close', { sessionId });
    }
  };

  const submitApproval = (requestId: string, approved: boolean) => {
    if (socketRef.current?.connected) {
      const sessionId = store.getState().activeSessionId;
      socketRef.current.emit('approval.submit', { sessionId, requestId, approved });
      store.getState().clearApproval(requestId);
    }
  };

  return {
    sendMessage,
    createSession,
    resumeSession,
    closeSession,
    submitApproval,
  };
}

async function fetchSessions(store: any, socket: any) {
  // Sessions are refreshed by re-requesting or getting from state
  // For simplicity, the server sends session lists via workspace.init
}

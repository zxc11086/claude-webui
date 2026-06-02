import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useChatStore } from '../stores/chat-store';
import { useAuthStore } from '../stores/auth-store';
import { ServerToClientEvents, Session } from '../types/index';

// 默认使用相对路径，让 Vite proxy 或同源部署转发请求
const SOCKET_URL = import.meta.env.VITE_WS_URL || '';

export function useWebSocket() {
  const socketRef = useRef<Socket | null>(null);
  const store = useChatStore;
  const token = useAuthStore((state) => state.token);

  useEffect(() => {
    if (!token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const socket: Socket<ServerToClientEvents> = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
      auth: {
        token,
      },
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
      console.log('[WS] workspace.init received:', data.sessions.length, 'sessions');
      store.getState().setWorkspace(data.workspaceId);
      store.getState().setSessions(data.sessions);
    });

    // --- Session events ---
    socket.on('session.created', (data: { sessionId: string; workspaceId: string; workspacePath: string }) => {
      store.getState().setActiveSession(data.sessionId);
      store.getState().resetChat();
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
      // isWaitingResponse may have been set to true by addMessage if the
      // last historical message was from user — reset it so the user can send
      store.setState({ isWaitingResponse: false });
    });

    socket.on('session.closed', (data: { sessionId: string; reason?: string }) => {
      const state = store.getState();

      if (data.reason === 'user_requested') {
        // User explicitly closed the session — remove from list and reset
        state.setSessions(state.sessions.filter(s => s.id !== data.sessionId));
        if (state.activeSessionId === data.sessionId) {
          state.setActiveSession(null);
          state.resetChat();
        }
      } else if (state.activeSessionId === data.sessionId) {
        // Process exited unexpectedly — keep session in sidebar, show error
        state.addMessage({
          id: `closed-${Date.now()}`,
          role: 'system',
          content: 'Claude 进程已断开，正在重新连接...点击会话可恢复对话。',
          createdAt: Date.now(),
        });
      }
    });

    // --- User message echo ---
    socket.on('user.message', (data: { id: string; sessionId: string; content: string; createdAt: number }) => {
      store.getState().addMessage({
        id: data.id,
        role: 'user',
        content: data.content,
        createdAt: data.createdAt,
      });
      
      // Add placeholder assistant message with "thinking" indicator
      store.getState().addMessage({
        id: `waiting-${Date.now()}`,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        isStreaming: false,
        toolCalls: [],
      });
    });

    // --- Assistant streaming ---
    socket.on('assistant.delta', (data: { sessionId: string; delta: string }) => {
      store.getState().appendDelta(data.delta);
    });

    socket.on('assistant.completed', (_data: { sessionId: string }) => {
      store.getState().finishStreaming();
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

    // --- Error ---
    socket.on('error', (data: { sessionId: string; message: string }) => {
      const state = store.getState();
      if (state.activeSessionId) {
        state.addMessage({
          id: `err-${Date.now()}`,
          role: 'system',
          content: `Error: ${data.message}`,
          createdAt: Date.now(),
        });
      } else {
        // No active session — show as global error on welcome page
        state.setGlobalError(data.message);
      }
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
  }, [token]);

  const sendMessage = (content: string, sessionId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('chat.send', { sessionId, content });
    }
  };

  const createSession = (workspaceId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('session.create', { workspaceId });
    } else {
      console.warn('[WS] Cannot create session: WebSocket not connected');
    }
  };

  const resumeSession = (sessionId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('session.resume', { sessionId });
    } else {
      console.warn('[WS] Cannot resume session: WebSocket not connected');
    }
  };

  const closeSession = (sessionId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('session.close', { sessionId });
    } else {
      console.warn('[WS] Cannot close session: WebSocket not connected');
    }
  };

  return {
    sendMessage,
    createSession,
    resumeSession,
    closeSession,
  };
}

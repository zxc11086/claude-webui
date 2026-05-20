import { create } from 'zustand';
import { UIMessage, ToolCall, Session } from '../types/index';

interface ChatState {
  // Session
  activeSessionId: string | null;
  workspaceId: string | null;
  sessions: Session[];

  // Messages
  messages: UIMessage[];
  isStreaming: boolean;
  streamingContent: string;
  isWaitingResponse: boolean;

  // Tool calls for current session
  toolCalls: ToolCall[];

  // Connection
  connected: boolean;

  // Global error (shown when no active session)
  globalError: string | null;

  // Actions
  setActiveSession: (sessionId: string | null) => void;
  setWorkspace: (workspaceId: string) => void;
  setSessions: (sessions: Session[]) => void;
  setConnected: (connected: boolean) => void;
  setGlobalError: (error: string | null) => void;

  addMessage: (msg: UIMessage) => void;
  appendDelta: (delta: string) => void;
  finishStreaming: () => void;

  addToolCall: (call: ToolCall) => void;
  updateToolCall: (toolId: string, update: Partial<ToolCall>) => void;
  appendToolOutput: (toolId: string, stream: 'stdout' | 'stderr', delta: string) => void;

  resetChat: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  activeSessionId: null,
  workspaceId: null,
  sessions: [],
  messages: [],
  isStreaming: false,
  streamingContent: '',
  isWaitingResponse: false,
  toolCalls: [],
  connected: false,
  globalError: null,

  setActiveSession: (sessionId) => set({ activeSessionId: sessionId, globalError: null }),
  setWorkspace: (workspaceId) => set({ workspaceId }),
  setSessions: (sessions) => set({ sessions }),
  setConnected: (connected) => set({ connected }),
  setGlobalError: (globalError) => set({ globalError }),

  addMessage: (msg) => {
    set((state) => ({
      messages: [...state.messages, msg],
      isWaitingResponse: msg.role === 'user' ? true : state.isWaitingResponse,
    }));
  },

  appendDelta: (delta) => {
    set((state) => {
      if (!state.isStreaming) {
        // Check if there's a waiting placeholder message
        const msgs = [...state.messages];
        const lastMsg = msgs[msgs.length - 1];
        
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content === '') {
          // Replace placeholder with actual content
          lastMsg.content = delta;
          lastMsg.isStreaming = true;
          return {
            isStreaming: true,
            streamingContent: delta,
            isWaitingResponse: false,
            messages: msgs,
          };
        } else {
          // Start a new streaming message
          const newMsg: UIMessage = {
            id: `stream-${Date.now()}`,
            role: 'assistant',
            content: delta,
            createdAt: Date.now(),
            isStreaming: true,
            toolCalls: [],
          };
          return {
            isStreaming: true,
            streamingContent: delta,
            isWaitingResponse: false,
            messages: [...state.messages, newMsg],
          };
        }
      }
      // Append to existing streaming message
      const newContent = state.streamingContent + delta;
      const msgs = [...state.messages];
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg && lastMsg.isStreaming) {
        lastMsg.content = newContent;
      }
      return {
        streamingContent: newContent,
        messages: msgs,
      };
    });
  },

  finishStreaming: () => {
    set((state) => {
      const msgs = [...state.messages];
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg && lastMsg.isStreaming) {
        lastMsg.isStreaming = false;
        lastMsg.id = `msg-${Date.now()}`;
        lastMsg.toolCalls = [...state.toolCalls];
      }
      return {
        isStreaming: false,
        streamingContent: '',
        messages: msgs,
      };
    });
  },

  addToolCall: (call) => {
    set((state) => ({
      toolCalls: [...state.toolCalls, call],
    }));
  },

  updateToolCall: (toolId, update) => {
    set((state) => ({
      toolCalls: state.toolCalls.map((tc) =>
        tc.toolId === toolId ? { ...tc, ...update } : tc
      ),
    }));
  },

  appendToolOutput: (toolId, stream, delta) => {
    set((state) => ({
      toolCalls: state.toolCalls.map((tc) => {
        if (tc.toolId !== toolId) return tc;
        const streams = [...(tc.streams || [])];
        const last = streams[streams.length - 1];
        if (last && last.stream === stream) {
          last.text += delta;
        } else {
          streams.push({ stream, text: delta });
        }
        return { ...tc, streams, status: 'running' as const };
      }),
    }));
  },

  resetChat: () => set({
    messages: [],
    toolCalls: [],
    isStreaming: false,
    streamingContent: '',
    isWaitingResponse: false,
  }),
}));

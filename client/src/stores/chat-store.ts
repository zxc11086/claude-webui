import { create } from 'zustand';
import { UIMessage, ToolCall, ApprovalRequest, Session } from '../types/index';

interface ChatState {
  // Session
  activeSessionId: string | null;
  workspaceId: string | null;
  sessions: Session[];

  // Messages
  messages: UIMessage[];
  isStreaming: boolean;
  streamingContent: string;

  // Tool calls for current session
  toolCalls: ToolCall[];

  // Pending approval
  pendingApproval: ApprovalRequest | null;

  // Connection
  connected: boolean;

  // Actions
  setActiveSession: (sessionId: string | null) => void;
  setWorkspace: (workspaceId: string) => void;
  setSessions: (sessions: Session[]) => void;
  setConnected: (connected: boolean) => void;

  addMessage: (msg: UIMessage) => void;
  appendDelta: (delta: string) => void;
  finishStreaming: () => void;

  addToolCall: (call: ToolCall) => void;
  updateToolCall: (toolId: string, update: Partial<ToolCall>) => void;
  appendToolOutput: (toolId: string, stream: 'stdout' | 'stderr', delta: string) => void;

  setPendingApproval: (approval: ApprovalRequest | null) => void;
  clearApproval: (requestId: string) => void;

  resetChat: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  activeSessionId: null,
  workspaceId: null,
  sessions: [],
  messages: [],
  isStreaming: false,
  streamingContent: '',
  toolCalls: [],
  pendingApproval: null,
  connected: false,

  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),
  setWorkspace: (workspaceId) => set({ workspaceId }),
  setSessions: (sessions) => set({ sessions }),
  setConnected: (connected) => set({ connected }),

  addMessage: (msg) => {
    set((state) => ({
      messages: [...state.messages, msg],
    }));
  },

  appendDelta: (delta) => {
    set((state) => {
      if (!state.isStreaming) {
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
          messages: [...state.messages, newMsg],
        };
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

  setPendingApproval: (approval) => set({ pendingApproval: approval }),
  clearApproval: (requestId) => {
    set((state) => {
      if (state.pendingApproval?.requestId === requestId) {
        return { pendingApproval: null };
      }
      return state;
    });
  },

  resetChat: () => set({
    messages: [],
    toolCalls: [],
    isStreaming: false,
    streamingContent: '',
    pendingApproval: null,
  }),
}));

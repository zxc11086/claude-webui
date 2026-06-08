import { create } from 'zustand';
import { UIMessage, ToolCall, Session } from '../types/index';

interface SessionState {
  messages: UIMessage[];
  isStreaming: boolean;
  streamingContent: string;
  isWaitingResponse: boolean;
  toolCalls: ToolCall[];
}

interface ChatState {
  // Session
  activeSessionId: string | null;
  workspaceId: string | null;
  sessions: Session[];

  // Per-session state cache
  sessionStates: Map<string, SessionState>;

  // Current session state (computed)
  messages: UIMessage[];
  isStreaming: boolean;
  streamingContent: string;
  isWaitingResponse: boolean;
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

  addMessage: (sessionId: string, msg: UIMessage) => void;
  appendDelta: (sessionId: string, delta: string) => void;
  finishStreaming: (sessionId: string) => void;

  addToolCall: (sessionId: string, call: ToolCall) => void;
  updateToolCall: (sessionId: string, toolId: string, update: Partial<ToolCall>) => void;
  appendToolOutput: (sessionId: string, toolId: string, stream: 'stdout' | 'stderr', delta: string) => void;

  loadSessionMessages: (sessionId: string, messages: UIMessage[]) => void;
  resetChat: () => void;
}

const emptySessionState = (): SessionState => ({
  messages: [],
  isStreaming: false,
  streamingContent: '',
  isWaitingResponse: false,
  toolCalls: [],
});

export const useChatStore = create<ChatState>((set, get) => ({
  activeSessionId: null,
  workspaceId: null,
  sessions: [],
  sessionStates: new Map(),
  
  // Current session state (computed from activeSessionId)
  messages: [],
  isStreaming: false,
  streamingContent: '',
  isWaitingResponse: false,
  toolCalls: [],
  
  connected: false,
  globalError: null,

  setActiveSession: (sessionId) => {
    set((state) => {
      if (!sessionId) {
        return {
          activeSessionId: null,
          messages: [],
          isStreaming: false,
          streamingContent: '',
          isWaitingResponse: false,
          toolCalls: [],
          globalError: null,
        };
      }

      // Get or create session state
      const sessionState = state.sessionStates.get(sessionId) || emptySessionState();
      
      return {
        activeSessionId: sessionId,
        messages: sessionState.messages,
        isStreaming: sessionState.isStreaming,
        streamingContent: sessionState.streamingContent,
        isWaitingResponse: sessionState.isWaitingResponse,
        toolCalls: sessionState.toolCalls,
        globalError: null,
      };
    });
  },

  setWorkspace: (workspaceId) => set({ workspaceId }),
  setSessions: (sessions) => set({ sessions }),
  setConnected: (connected) => set({ connected }),
  setGlobalError: (globalError) => set({ globalError }),

  loadSessionMessages: (sessionId, messages) => {
    set((state) => {
      const newStates = new Map(state.sessionStates);
      const existingState = newStates.get(sessionId);
      
      // If session state already exists (e.g., streaming in background), don't overwrite it
      // Only load messages if the session is brand new
      if (!existingState || existingState.messages.length === 0) {
        newStates.set(sessionId, {
          messages,
          isStreaming: false,
          streamingContent: '',
          isWaitingResponse: false,
          toolCalls: [],
        });
      }

      // Get the actual state to display (either existing or newly loaded)
      const sessionState = newStates.get(sessionId)!;

      // If this is the active session, update current state
      if (state.activeSessionId === sessionId) {
        return {
          sessionStates: newStates,
          messages: sessionState.messages,
          isStreaming: sessionState.isStreaming,
          streamingContent: sessionState.streamingContent,
          isWaitingResponse: sessionState.isWaitingResponse,
          toolCalls: sessionState.toolCalls,
        };
      }

      return { sessionStates: newStates };
    });
  },

  addMessage: (sessionId, msg) => {
    set((state) => {
      const newStates = new Map(state.sessionStates);
      const sessionState = newStates.get(sessionId) || emptySessionState();
      
      const newMessages = [...sessionState.messages, msg];
      const newWaitingResponse = msg.role === 'user' ? true : sessionState.isWaitingResponse;
      
      newStates.set(sessionId, {
        ...sessionState,
        messages: newMessages,
        isWaitingResponse: newWaitingResponse,
      });

      // If this is the active session, update current state
      if (state.activeSessionId === sessionId) {
        return {
          sessionStates: newStates,
          messages: newMessages,
          isWaitingResponse: newWaitingResponse,
        };
      }

      return { sessionStates: newStates };
    });
  },

  appendDelta: (sessionId, delta) => {
    set((state) => {
      const newStates = new Map(state.sessionStates);
      const sessionState = newStates.get(sessionId) || emptySessionState();

      let newMessages = [...sessionState.messages];
      let newIsStreaming = sessionState.isStreaming;
      let newStreamingContent = sessionState.streamingContent;
      let newIsWaitingResponse = sessionState.isWaitingResponse;

      if (!sessionState.isStreaming) {
        // Check if there's a waiting placeholder message
        const lastMsg = newMessages[newMessages.length - 1];
        
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content === '') {
          // Replace placeholder with actual content
          lastMsg.content = delta;
          lastMsg.isStreaming = true;
          newIsStreaming = true;
          newStreamingContent = delta;
          newIsWaitingResponse = false;
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
          newMessages = [...newMessages, newMsg];
          newIsStreaming = true;
          newStreamingContent = delta;
          newIsWaitingResponse = false;
        }
      } else {
        // Append to existing streaming message
        newStreamingContent = sessionState.streamingContent + delta;
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg && lastMsg.isStreaming) {
          lastMsg.content = newStreamingContent;
        }
      }

      newStates.set(sessionId, {
        ...sessionState,
        messages: newMessages,
        isStreaming: newIsStreaming,
        streamingContent: newStreamingContent,
        isWaitingResponse: newIsWaitingResponse,
      });

      // If this is the active session, update current state
      if (state.activeSessionId === sessionId) {
        return {
          sessionStates: newStates,
          messages: newMessages,
          isStreaming: newIsStreaming,
          streamingContent: newStreamingContent,
          isWaitingResponse: newIsWaitingResponse,
        };
      }

      return { sessionStates: newStates };
    });
  },

  finishStreaming: (sessionId) => {
    set((state) => {
      const newStates = new Map(state.sessionStates);
      const sessionState = newStates.get(sessionId) || emptySessionState();

      const newMessages = [...sessionState.messages];
      const lastMsg = newMessages[newMessages.length - 1];
      if (lastMsg && lastMsg.isStreaming) {
        lastMsg.isStreaming = false;
        lastMsg.id = `msg-${Date.now()}`;
        lastMsg.toolCalls = [...sessionState.toolCalls];
      }

      newStates.set(sessionId, {
        ...sessionState,
        messages: newMessages,
        isStreaming: false,
        streamingContent: '',
      });

      // If this is the active session, update current state
      if (state.activeSessionId === sessionId) {
        return {
          sessionStates: newStates,
          messages: newMessages,
          isStreaming: false,
          streamingContent: '',
        };
      }

      return { sessionStates: newStates };
    });
  },

  addToolCall: (sessionId, call) => {
    set((state) => {
      const newStates = new Map(state.sessionStates);
      const sessionState = newStates.get(sessionId) || emptySessionState();

      const newToolCalls = [...sessionState.toolCalls, call];

      newStates.set(sessionId, {
        ...sessionState,
        toolCalls: newToolCalls,
      });

      // If this is the active session, update current state
      if (state.activeSessionId === sessionId) {
        return {
          sessionStates: newStates,
          toolCalls: newToolCalls,
        };
      }

      return { sessionStates: newStates };
    });
  },

  updateToolCall: (sessionId, toolId, update) => {
    set((state) => {
      const newStates = new Map(state.sessionStates);
      const sessionState = newStates.get(sessionId) || emptySessionState();

      const newToolCalls = sessionState.toolCalls.map((tc) =>
        tc.toolId === toolId ? { ...tc, ...update } : tc
      );

      newStates.set(sessionId, {
        ...sessionState,
        toolCalls: newToolCalls,
      });

      // If this is the active session, update current state
      if (state.activeSessionId === sessionId) {
        return {
          sessionStates: newStates,
          toolCalls: newToolCalls,
        };
      }

      return { sessionStates: newStates };
    });
  },

  appendToolOutput: (sessionId, toolId, stream, delta) => {
    set((state) => {
      const newStates = new Map(state.sessionStates);
      const sessionState = newStates.get(sessionId) || emptySessionState();

      const newToolCalls = sessionState.toolCalls.map((tc) => {
        if (tc.toolId !== toolId) return tc;
        const streams = [...(tc.streams || [])];
        const last = streams[streams.length - 1];
        if (last && last.stream === stream) {
          last.text += delta;
        } else {
          streams.push({ stream, text: delta });
        }
        return { ...tc, streams, status: 'running' as const };
      });

      newStates.set(sessionId, {
        ...sessionState,
        toolCalls: newToolCalls,
      });

      // If this is the active session, update current state
      if (state.activeSessionId === sessionId) {
        return {
          sessionStates: newStates,
          toolCalls: newToolCalls,
        };
      }

      return { sessionStates: newStates };
    });
  },

  resetChat: () => set({
    messages: [],
    toolCalls: [],
    isStreaming: false,
    streamingContent: '',
    isWaitingResponse: false,
  }),
}));

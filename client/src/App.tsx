import { useState, useCallback } from 'react';
import { useWebSocket } from './hooks/use-websocket';
import { Sidebar } from './components/layout/Sidebar';
import { ChatView } from './components/chat/ChatView';
import { ApprovalDialog } from './components/tools/ApprovalDialog';
import { useChatStore } from './stores/chat-store';

export default function App() {
  const ws = useWebSocket();
  const { connected, activeSessionId, pendingApproval, workspaceId } = useChatStore();
  const [creating, setCreating] = useState(false);

  const handleCreateSession = useCallback(async () => {
    setCreating(true);
    try {
      // First, ensure we have a workspace
      let wid = useChatStore.getState().workspaceId;

      if (!wid) {
        // Fetch workspace from API if WebSocket hasn't delivered it yet
        const res = await fetch('/api/workspaces?userId=default');
        const workspaces = await res.json();
        if (workspaces.length > 0) {
          wid = workspaces[0].id;
          useChatStore.getState().setWorkspace(wid);
        } else {
          // Create default workspace via API
          const createRes = await fetch('/api/workspaces', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'default', userId: 'default' }),
          });
          const ws = await createRes.json();
          wid = ws.id;
          useChatStore.getState().setWorkspace(wid);
        }
      }

      if (wid) {
        ws.createSession(wid);
      }
    } catch (err) {
      console.error('Failed to create session:', err);
    } finally {
      setCreating(false);
    }
  }, [ws]);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        ws={ws}
      />

      {/* Main area */}
      <main className="flex-1 flex flex-col min-w-0 bg-background">
        {!connected && (
          <div className="flex items-center justify-center gap-2 px-4 py-2 bg-yellow-900/30 border-b border-yellow-700/50 text-yellow-200 text-sm">
            <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse-dot" />
            正在连接服务器...
          </div>
        )}

        {!activeSessionId ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-6 max-w-md">
              <div className="text-6xl">🤖</div>
              <h1 className="text-2xl font-bold text-foreground">Claude Code WebUI</h1>
              <p className="text-muted-foreground leading-relaxed">
                基于 Claude Code CLI 的多用户 Web 界面。
                创建会话开始与 Claude 交互，支持流式输出、Tool Call 可视化和 Shell 输出实时展示。
              </p>
              <button
                onClick={handleCreateSession}
                disabled={!connected || creating}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity font-medium"
              >
                {creating ? '创建中...' : '开始新会话'}
              </button>
              <p className="text-xs text-muted-foreground">
                连接状态: {connected ? '已连接' : '未连接'}
              </p>
            </div>
          </div>
        ) : (
          <ChatView ws={ws} />
        )}
      </main>

      {/* Approval Dialog */}
      {pendingApproval && (
        <ApprovalDialog
          approval={pendingApproval}
          onApprove={() => ws.submitApproval(pendingApproval.requestId, true)}
          onDeny={() => ws.submitApproval(pendingApproval.requestId, false)}
        />
      )}
    </div>
  );
}

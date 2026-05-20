import { useState, useCallback, useEffect } from 'react';
import { useWebSocket } from './hooks/use-websocket';
import { useAuthStore } from './stores/auth-store';
import { useThemeStore } from './stores/theme-store';
import { LoginForm } from './components/auth/LoginForm';
import { AdminPanel } from './components/admin/AdminPanel';
import { Sidebar } from './components/layout/Sidebar';
import { ChatView } from './components/chat/ChatView';
import { useChatStore } from './stores/chat-store';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function App() {
  const { isAuthenticated, token, logout, user } = useAuthStore();
  const ws = useWebSocket();
  const { connected, activeSessionId, globalError } = useChatStore();
  const [creating, setCreating] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const { theme, setTheme } = useThemeStore();

  useEffect(() => {
    setTheme(theme);
  }, [theme, setTheme]);

  const handleCreateSession = useCallback(async () => {
    setCreating(true);
    try {
      let wid = useChatStore.getState().workspaceId;
      console.log('[App] handleCreateSession: workspaceId from store:', wid);

      if (!wid) {
        console.log('[App] No workspaceId, fetching from API...');
        const res = await fetch(`${API_URL}/api/workspaces`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        const workspaces = await res.json();
        if (workspaces.length > 0) {
          wid = workspaces[0].id as string;
          useChatStore.getState().setWorkspace(wid);
          console.log('[App] Using existing workspace:', wid);
        } else {
          console.log('[App] Creating new workspace...');
          const createRes = await fetch(`${API_URL}/api/workspaces`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ name: 'default' }),
          });
          const newWorkspace = await createRes.json();
          wid = newWorkspace.id as string;
          useChatStore.getState().setWorkspace(wid);
          console.log('[App] Created workspace:', wid);
        }
      }

      if (wid) {
        console.log('[App] Calling ws.createSession with workspaceId:', wid);
        ws.createSession(wid);
      } else {
        console.error('[App] Failed to obtain workspaceId');
      }
    } catch (err) {
      console.error('[App] Failed to create session:', err);
      useChatStore.getState().setGlobalError(
        err instanceof Error ? err.message : '创建会话失败，请检查服务器连接',
      );
    } finally {
      setCreating(false);
    }
  }, [ws, token]);

  if (!isAuthenticated) {
    return <LoginForm />;
  }

  return (
    <>
      <div className="flex h-screen w-screen overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          ws={ws}
          onLogout={logout}
          onOpenAdmin={user?.role === 'admin' ? () => setShowAdmin(true) : undefined}
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

              {/* Global error banner */}
              {globalError && (
                <div className="p-4 rounded-lg bg-red-900/30 border border-red-700/50 text-red-200 text-sm text-left">
                  <div className="font-medium mb-1">创建会话失败</div>
                  <div className="text-red-300/80">{globalError}</div>
                </div>
              )}

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

    </div>

    {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
  </>
  );
}

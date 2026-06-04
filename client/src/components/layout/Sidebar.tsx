import { useChatStore } from '../../stores/chat-store';
import { useAuthStore } from '../../stores/auth-store';
import { useThemeStore } from '../../stores/theme-store';
import { formatDate, truncate } from '../../lib/utils';
import { Plus, MessageSquare, Trash2, Terminal, FolderOpen, LogOut, Shield, Sun, Moon } from 'lucide-react';

interface SidebarProps {
  ws: {
    createSession: (workspaceId: string) => void;
    resumeSession: (sessionId: string) => void;
    closeSession: (sessionId: string) => void;
  };
  onLogout: () => void;
  onOpenAdmin?: () => void;
}

export function Sidebar({ ws, onLogout, onOpenAdmin }: SidebarProps) {
  const {
    activeSessionId,
    sessions,
    workspaceId,
    connected,
  } = useChatStore();
  const user = useAuthStore((state) => state.user);
  const { theme, toggleTheme } = useThemeStore();

  return (
    <aside className="w-64 flex-shrink-0 border-r border-border bg-card flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-3">
          <Terminal className="w-5 h-5 text-primary" />
          <span className="font-semibold text-sm">智能问数</span>
        </div>
        <button
          onClick={() => {
            if (workspaceId) ws.createSession(workspaceId);
          }}
          disabled={!connected}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          新建会话
        </button>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="text-xs text-muted-foreground px-2 py-2 font-medium uppercase tracking-wider">
          会话历史
        </div>
        {sessions.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8">
            暂无会话记录
          </div>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => ws.resumeSession(session.id)}
              className={`
                group flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer text-sm mb-1
                transition-colors
                ${activeSessionId === session.id
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
                }
              `}
            >
              <MessageSquare className="w-4 h-4 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="truncate">
                  {session.title || '新会话'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDate(session.createdAt)}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  ws.closeSession(session.id);
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-900/30 rounded"
                title="关闭会话"
              >
                <Trash2 className="w-3 h-3 text-red-400" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-border space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          {connected ? '已连接' : '未连接'}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FolderOpen className="w-3 h-3" />
          <span className="truncate">default</span>
        </div>
        <div className="pt-2 border-t border-border space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="flex-1 truncate">{user?.email}</div>
            {user?.role === 'admin' && (
              <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded text-xs border border-purple-500/30">
                管理员
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={toggleTheme}
              className="flex items-center justify-center p-2 hover:bg-accent rounded transition-colors text-muted-foreground hover:text-foreground"
              title={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            {user?.role === 'admin' && onOpenAdmin && (
              <button
                onClick={onOpenAdmin}
                className="flex-1 flex items-center justify-center gap-1 p-2 hover:bg-accent rounded transition-colors text-xs text-muted-foreground hover:text-foreground"
                title="管理面板"
              >
                <Shield className="w-4 h-4" />
                <span>管理</span>
              </button>
            )}
            <button
              onClick={onLogout}
              className="flex-1 flex items-center justify-center gap-1 p-2 hover:bg-accent rounded transition-colors text-xs text-muted-foreground hover:text-foreground"
              title="退出登录"
            >
              <LogOut className="w-4 h-4" />
              <span>退出</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

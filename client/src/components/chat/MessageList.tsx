import { useRef, useEffect, useState } from 'react';
import { useChatStore } from '../../stores/chat-store';
import { MessageItem } from './MessageItem';
import { Share2, X } from 'lucide-react';

export function MessageList() {
  const { messages, isStreaming } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const handleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === messages.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(messages.map(m => m.id)));
    }
  };

  const handleShare = async () => {
    if (selectedIds.size === 0) return;

    setIsSharing(true);
    try {
      const messagesToShare = messages.filter(m => selectedIds.has(m.id));
      const response = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messagesToShare }),
      });

      if (response.ok) {
        const data = await response.json();
        const url = `${window.location.origin}/share/${data.shareId}`;
        setShareUrl(url);
        await navigator.clipboard.writeText(url);
      }
    } catch (err) {
      console.error('Failed to create share:', err);
    } finally {
      setIsSharing(false);
    }
  };

  const handleCancelSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setShareUrl(null);
  };

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        <div className="text-center space-y-3">
          <div className="text-4xl">👋</div>
          <p>开始与智能问数对话吧</p>
          <p className="text-xs text-muted-foreground/70">
            基于本体知识图谱的智能问数平台
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col relative">
      {/* Share toolbar */}
      {messages.length > 0 && (
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border px-4 py-2 flex items-center justify-between">
          {!selectionMode ? (
            <button
              onClick={() => setSelectionMode(true)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Share2 className="w-4 h-4" />
              分享对话
            </button>
          ) : (
            <div className="flex items-center gap-3 w-full">
              <button
                onClick={handleCancelSelection}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
              <span className="text-sm text-muted-foreground">
                已选择 {selectedIds.size} 条消息
              </span>
              <button
                onClick={handleSelectAll}
                className="text-sm text-primary hover:underline"
              >
                {selectedIds.size === messages.length ? '取消全选' : '全选'}
              </button>
              <div className="flex-1" />
              {shareUrl ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-green-600">已复制链接到剪贴板</span>
                  <code className="text-xs bg-muted px-2 py-1 rounded">{shareUrl}</code>
                </div>
              ) : (
                <button
                  onClick={handleShare}
                  disabled={selectedIds.size === 0 || isSharing}
                  className="px-4 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSharing ? '生成中...' : '生成分享链接'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6" style={{ paddingLeft: selectionMode ? '3rem' : '1rem' }}>
        {messages.map((msg) => (
          <MessageItem
            key={msg.id}
            message={msg}
            onSelect={selectionMode ? handleSelect : undefined}
            isSelected={selectedIds.has(msg.id)}
          />
        ))}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

import { useRef, useEffect, useState } from 'react';
import { useChatStore } from '../../stores/chat-store';
import { MessageItem } from './MessageItem';
import { X } from 'lucide-react';

export function MessageList() {
  const { messages, isStreaming } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [shareMode, setShareMode] = useState(false);
  const [selectedPairs, setSelectedPairs] = useState<Set<number>>(new Set());
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  // 找到消息对的索引（user+assistant）
  const getMessagePairIndex = (messageId: string): number => {
    const msgIndex = messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return -1;
    
    const msg = messages[msgIndex];
    if (msg.role === 'assistant') {
      // 找到前一条用户消息
      for (let i = msgIndex - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          return i;
        }
      }
    }
    return -1;
  };

  const handleShareClick = (messageId: string) => {
    if (!shareMode) {
      // 首次点击，进入分享模式
      setShareMode(true);
      const pairIndex = getMessagePairIndex(messageId);
      if (pairIndex !== -1) {
        setSelectedPairs(new Set([pairIndex]));
      }
    } else {
      // 已在分享模式，切换选择
      const pairIndex = getMessagePairIndex(messageId);
      if (pairIndex !== -1) {
        setSelectedPairs(prev => {
          const next = new Set(prev);
          if (next.has(pairIndex)) {
            next.delete(pairIndex);
          } else {
            next.add(pairIndex);
          }
          return next;
        });
      }
    }
  };

  // 获取所有对话对的数量
  const getTotalPairs = (): number => {
    let count = 0;
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role === 'user' && messages[i + 1]?.role === 'assistant') {
        count++;
      }
    }
    return count;
  };

  const handleSelectAll = () => {
    const allPairIndices: number[] = [];
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role === 'user' && messages[i + 1]?.role === 'assistant') {
        allPairIndices.push(i);
      }
    }
    
    if (selectedPairs.size === allPairIndices.length) {
      setSelectedPairs(new Set());
    } else {
      setSelectedPairs(new Set(allPairIndices));
    }
  };

  const handleCancelShare = () => {
    setShareMode(false);
    setSelectedPairs(new Set());
    setShareUrl(null);
  };

  const handleConfirmShare = async () => {
    if (selectedPairs.size === 0) return;

    setIsSharing(true);
    try {
      // 收集选中的消息对
      const messagesToShare: typeof messages = [];
      selectedPairs.forEach(pairStartIndex => {
        // 添加用户消息
        if (messages[pairStartIndex]?.role === 'user') {
          messagesToShare.push(messages[pairStartIndex]);
        }
        // 添加assistant消息
        for (let i = pairStartIndex + 1; i < messages.length; i++) {
          if (messages[i].role === 'assistant') {
            messagesToShare.push(messages[i]);
            break;
          }
        }
      });

      const response = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messagesToShare }),
      });

      if (response.ok) {
        const data = await response.json();
        const url = `${window.location.origin}/share/${data.shareId}`;
        
        // 立即关闭分享模式
        handleCancelShare();
        
        // 显示通知
        setShareUrl(url);
        
        // Copy to clipboard with fallback
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(url);
        } else {
          const textArea = document.createElement('textarea');
          textArea.value = url;
          textArea.style.position = 'fixed';
          textArea.style.left = '-999999px';
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
        }
        
        setTimeout(() => {
          setShareUrl(null);
        }, 3000);
      }
    } catch (err) {
      console.error('Failed to create share:', err);
    } finally {
      setIsSharing(false);
    }
  };

  const isMessageSelected = (messageId: string): boolean => {
    const pairIndex = getMessagePairIndex(messageId);
    return pairIndex !== -1 && selectedPairs.has(pairIndex);
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
      {shareMode && (
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleCancelShare}
              className="text-sm text-muted-foreground hover:text-foreground"
              title="取消"
            >
              <X className="w-4 h-4" />
            </button>
            <span className="text-sm text-muted-foreground">
              已选择 {selectedPairs.size} 组对话
            </span>
            <button
              onClick={handleSelectAll}
              className="text-sm text-primary hover:underline"
            >
              {selectedPairs.size === getTotalPairs() ? '取消全选' : '全选'}
            </button>
          </div>
          <button
            onClick={handleConfirmShare}
            disabled={selectedPairs.size === 0 || isSharing}
            className="px-4 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSharing ? '生成中...' : '生成分享链接'}
          </button>
        </div>
      )}

      {/* Share notification */}
      {shareUrl && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-fade-in">
          <span className="text-sm">分享链接已复制到剪贴板</span>
        </div>
      )}

      {/* Messages */}
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6" style={{ paddingLeft: shareMode ? '3rem' : '1rem' }}>
        {messages.map((msg) => (
          <MessageItem
            key={msg.id}
            message={msg}
            onShare={handleShareClick}
            isShareMode={shareMode}
            isSelected={isMessageSelected(msg.id)}
          />
        ))}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

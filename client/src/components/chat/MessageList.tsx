import { useRef, useEffect } from 'react';
import { useChatStore } from '../../stores/chat-store';
import { MessageItem } from './MessageItem';

export function MessageList() {
  const { messages, isStreaming } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        <div className="text-center space-y-3">
          <div className="text-4xl">👋</div>
          <p>开始与 Claude 对话吧</p>
          <p className="text-xs text-muted-foreground/70">
            Claude 可以编辑文件、执行命令、搜索代码
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {messages.map((msg) => (
        <MessageItem key={msg.id} message={msg} />
      ))}

      <div ref={bottomRef} />
    </div>
  );
}

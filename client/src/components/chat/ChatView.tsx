import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { useChatStore } from '../../stores/chat-store';
import { ToolCallCard } from '../tools/ToolCallCard';

interface ChatViewProps {
  ws: {
    sendMessage: (content: string, sessionId: string) => void;
  };
}

export function ChatView({ ws }: ChatViewProps) {
  const { activeSessionId, toolCalls, isStreaming } = useChatStore();

  const handleSend = (content: string) => {
    if (activeSessionId) {
      ws.sendMessage(content, activeSessionId);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        <MessageList />

        {/* Active tool calls footer */}
        {toolCalls.length > 0 && (
          <div className="border-t border-border px-4 py-3 space-y-2 bg-card/50">
            <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              工具调用
            </div>
            {toolCalls.map((tc) => (
              <ToolCallCard key={tc.toolId} toolCall={tc} />
            ))}
          </div>
        )}
      </div>

      {/* Input area */}
      <ChatInput
        onSend={handleSend}
        disabled={!activeSessionId}
        isStreaming={isStreaming}
      />
    </div>
  );
}

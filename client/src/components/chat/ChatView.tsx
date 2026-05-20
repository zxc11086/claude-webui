import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { useChatStore } from '../../stores/chat-store';

interface ChatViewProps {
  ws: {
    sendMessage: (content: string, sessionId: string) => void;
  };
}

export function ChatView({ ws }: ChatViewProps) {
  const { activeSessionId, isStreaming, isWaitingResponse } = useChatStore();

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
      </div>

      {/* Input area */}
      <ChatInput
        onSend={handleSend}
        disabled={!activeSessionId}
        isStreaming={isStreaming}
        isWaitingResponse={isWaitingResponse}
      />
    </div>
  );
}

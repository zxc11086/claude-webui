import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { UIMessage } from '../../types/index';
import { MessageItem } from './MessageItem';
import { AlertCircle } from 'lucide-react';

export function SharedView() {
  const { shareId } = useParams<{ shareId: string }>();
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shareId) return;

    fetch(`/api/share/${shareId}`)
      .then(res => {
        if (!res.ok) {
          throw new Error('分享不存在或已过期');
        }
        return res.json();
      })
      .then(data => {
        setMessages(data.messages);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [shareId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <p className="text-foreground font-medium">无法加载分享内容</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <h1 className="text-lg font-semibold text-foreground">分享的对话</h1>
          <p className="text-xs text-muted-foreground mt-1">
            此对话由智能问数平台生成并分享
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {messages.map((msg) => (
          <MessageItem key={msg.id} message={msg} />
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-border bg-card/50 mt-8">
        <div className="max-w-3xl mx-auto px-4 py-4 text-center">
          <p className="text-xs text-muted-foreground">
            想体验智能问数？
            <a href="/" className="text-primary hover:underline ml-1">
              立即开始使用
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

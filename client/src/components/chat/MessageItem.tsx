import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { UIMessage } from '../../types/index';
import { formatTime } from '../../lib/utils';
import { Bot, User, Wrench, AlertCircle } from 'lucide-react';

interface MessageItemProps {
  message: UIMessage;
}

export function MessageItem({ message }: MessageItemProps) {
  const { role, content, createdAt, isStreaming } = message;

  const iconMap = {
    user: <User className="w-5 h-5" />,
    assistant: <Bot className="w-5 h-5 text-primary" />,
    tool: <Wrench className="w-5 h-5 text-yellow-400" />,
    system: <AlertCircle className="w-5 h-5 text-red-400" />,
  };

  const roleLabelMap = {
    user: '你',
    assistant: 'Claude',
    tool: '工具',
    system: '系统',
  };

  return (
    <div className={`animate-fade-in flex gap-3 ${role === 'user' ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className={`
        flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center
        ${role === 'user'
          ? 'bg-primary/20 text-primary'
          : role === 'assistant'
            ? 'bg-primary/10 text-primary'
            : role === 'tool'
              ? 'bg-yellow-900/30 text-yellow-400'
              : 'bg-red-900/30 text-red-400'
        }
      `}>
        {iconMap[role]}
      </div>

      {/* Content */}
      <div className={`flex-1 min-w-0 ${role === 'user' ? 'text-right' : ''}`}>
        {/* Header */}
        <div className={`flex items-center gap-2 mb-1 ${role === 'user' ? 'flex-row-reverse' : ''}`}>
          <span className="text-xs font-medium text-foreground">
            {roleLabelMap[role]}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatTime(createdAt)}
          </span>
        </div>

        {/* Body */}
        <div className={`
          rounded-lg px-4 py-3 text-sm leading-relaxed
          ${role === 'user'
            ? 'bg-primary text-primary-foreground ml-auto max-w-[85%] inline-block text-left'
            : role === 'assistant'
              ? 'bg-card border border-border text-foreground'
              : role === 'tool'
                ? 'bg-yellow-900/10 border border-yellow-900/30 text-muted-foreground'
                : 'bg-red-900/10 border border-red-900/30 text-red-300'
          }
        `}>
          {role === 'assistant' || role === 'user' ? (
            <div className="markdown-body">
              <ReactMarkdown
                components={{
                  code({ node, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    const codeStr = String(children).replace(/\n$/, '');
                    const isInline = !match && !String(children).includes('\n');

                    if (isInline) {
                      return (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    }

                    return (
                      <SyntaxHighlighter
                        style={oneDark}
                        language={match?.[1] || 'text'}
                        PreTag="div"
                        customStyle={{
                          borderRadius: '0.5rem',
                          fontSize: '0.8125rem',
                        }}
                      >
                        {codeStr}
                      </SyntaxHighlighter>
                    );
                  },
                }}
              >
                {content}
              </ReactMarkdown>
              {isStreaming && (
                <span className="inline-block w-2 h-4 bg-primary ml-0.5 animate-pulse align-text-bottom" />
              )}
            </div>
          ) : (
            <pre className="whitespace-pre-wrap text-xs font-mono">{content}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

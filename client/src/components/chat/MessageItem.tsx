import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { UIMessage } from '../../types/index';
import { formatTime } from '../../lib/utils';
import { Bot, User, Wrench, AlertCircle } from 'lucide-react';
import { useThemeStore } from '../../stores/theme-store';
import 'katex/dist/katex.min.css';

interface MessageItemProps {
  message: UIMessage;
}

export function MessageItem({ message }: MessageItemProps) {
  const { role, content, createdAt, isStreaming } = message;
  const isWaiting = role === 'assistant' && content === '' && !isStreaming;
  const { theme } = useThemeStore();

  const iconMap = {
    user: <User className="w-5 h-5" />,
    assistant: <Bot className="w-5 h-5 text-primary" />,
    tool: <Wrench className="w-5 h-5 text-yellow-400" />,
    system: <AlertCircle className="w-5 h-5 text-red-400" />,
  };

  const roleLabelMap = {
    user: '你',
    assistant: '智能问数',
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
          {isWaiting ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: '200ms' }} />
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: '400ms' }} />
              </div>
              <span>正在思考中...</span>
            </div>
          ) : role === 'assistant' || role === 'user' ? (
            <div className="markdown-body">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex, rehypeRaw]}
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
                        style={theme === 'light' ? oneLight : oneDark}
                        language={match?.[1] || 'text'}
                        PreTag="div"
                        customStyle={{
                          borderRadius: '0.5rem',
                          fontSize: '0.8125rem',
                          margin: '0.5rem 0',
                        }}
                      >
                        {codeStr}
                      </SyntaxHighlighter>
                    );
                  },
                  table({ children }) {
                    return (
                      <div className="overflow-x-auto my-4">
                        <table className="min-w-full border-collapse">
                          {children}
                        </table>
                      </div>
                    );
                  },
                  th({ children }) {
                    return (
                      <th className="border border-border px-3 py-2 bg-muted font-semibold text-left">
                        {children}
                      </th>
                    );
                  },
                  td({ children }) {
                    return (
                      <td className="border border-border px-3 py-2">
                        {children}
                      </td>
                    );
                  },
                  a({ href, children }) {
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {children}
                      </a>
                    );
                  },
                  blockquote({ children }) {
                    return (
                      <blockquote className="border-l-4 border-primary pl-4 my-4 italic text-muted-foreground">
                        {children}
                      </blockquote>
                    );
                  },
                  hr() {
                    return <hr className="my-4 border-border" />;
                  },
                  img({ src, alt }) {
                    return (
                      <img
                        src={src}
                        alt={alt}
                        className="max-w-full h-auto rounded-lg my-4"
                      />
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

import { useState } from 'react';
import { ToolCall } from '../../types/index';
import { cn } from '../../lib/utils';
import { ChevronDown, ChevronRight, Loader2, Check, AlertTriangle, Terminal, FileText, Search, Wrench } from 'lucide-react';

interface ToolCallCardProps {
  toolCall: ToolCall;
}

const toolIcons: Record<string, React.ReactNode> = {
  bash: <Terminal className="w-4 h-4" />,
  read: <FileText className="w-4 h-4" />,
  edit: <FileText className="w-4 h-4" />,
  write: <FileText className="w-4 h-4" />,
  grep: <Search className="w-4 h-4" />,
  glob: <Search className="w-4 h-4" />,
  default: <Wrench className="w-4 h-4" />,
};

const statusIcons = {
  pending: <div className="w-3 h-3 rounded-full border-2 border-muted-foreground/50" />,
  running: <Loader2 className="w-3 h-3 animate-spin text-yellow-400" />,
  completed: <Check className="w-3 h-3 text-green-400" />,
  error: <AlertTriangle className="w-3 h-3 text-red-400" />,
};

function formatInput(input: any): string {
  if (typeof input === 'string') return input;
  if (input?.command) return input.command;
  if (input?.file_path) return input.file_path;
  if (input?.pattern) return input.pattern;
  return JSON.stringify(input).slice(0, 100);
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { tool, input, status, output, streams } = toolCall;

  const icon = toolIcons[tool] || toolIcons.default;
  const statusIcon = statusIcons[status];
  const inputPreview = formatInput(input);

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card/30 text-sm animate-fade-in">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent/30 transition-colors text-left"
      >
        <span className="text-muted-foreground">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
        <span className="text-muted-foreground">{icon}</span>
        <span className="font-medium text-foreground">{tool}</span>
        <span className="text-muted-foreground truncate flex-1">{inputPreview}</span>
        <span>{statusIcon}</span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border px-3 py-2 space-y-2 bg-background/50">
          {/* Input */}
          <div>
            <div className="text-xs text-muted-foreground mb-1 font-medium">输入</div>
            <pre className="text-xs bg-muted rounded p-2 overflow-x-auto font-mono whitespace-pre-wrap">
              {JSON.stringify(input, null, 2)}
            </pre>
          </div>

          {/* Stream output */}
          {streams && streams.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-1 font-medium">输出</div>
              <pre className="text-xs bg-black/50 rounded p-2 overflow-x-auto font-mono whitespace-pre-wrap max-h-48 overflow-y-auto text-green-400">
                {streams.map((s, i) => (
                  <span key={i} className={s.stream === 'stderr' ? 'text-red-400' : 'text-green-400'}>
                    {s.text}
                  </span>
                ))}
              </pre>
            </div>
          )}

          {/* Final output */}
          {output && (
            <div>
              <div className="text-xs text-muted-foreground mb-1 font-medium">结果</div>
              <pre className="text-xs bg-muted rounded p-2 overflow-x-auto font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
                {output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

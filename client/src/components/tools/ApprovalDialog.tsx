import { ApprovalRequest } from '../../types/index';
import { AlertTriangle, Shield, Terminal, X, Check } from 'lucide-react';

interface ApprovalDialogProps {
  approval: ApprovalRequest;
  onApprove: () => void;
  onDeny: () => void;
}

export function ApprovalDialog({ approval, onApprove, onDeny }: ApprovalDialogProps) {
  const { tool, input, message } = approval;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-yellow-900/10">
          <div className="w-10 h-10 rounded-lg bg-yellow-900/30 flex items-center justify-center">
            <Shield className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">需要批准</h3>
            <p className="text-sm text-muted-foreground">Claude 请求执行以下操作</p>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Tool */}
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">{tool}</span>
          </div>

          {/* Message */}
          {message && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-900/10 border border-yellow-900/20">
              <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-200">{message}</p>
            </div>
          )}

          {/* Input preview */}
          <div>
            <div className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wider">
              命令 / 操作
            </div>
            <pre className="text-sm bg-background border border-border rounded-lg p-3 font-mono whitespace-pre-wrap break-all">
              {typeof input === 'string' ? input : JSON.stringify(input, null, 2)}
            </pre>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-border bg-background/50">
          <button
            onClick={onDeny}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-red-800/50 text-red-400 hover:bg-red-900/20 transition-colors font-medium text-sm"
          >
            <X className="w-4 h-4" />
            拒绝
          </button>
          <button
            onClick={onApprove}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-green-700 text-white hover:bg-green-600 transition-colors font-medium text-sm"
          >
            <Check className="w-4 h-4" />
            批准
          </button>
        </div>
      </div>
    </div>
  );
}

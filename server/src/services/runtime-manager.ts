import { spawn, spawnSync, ChildProcess } from 'child_process';
import { config } from '../config.js';
import { StreamParser } from './stream-parser.js';
import { RuntimeEvent, ClaudeStreamEvent } from '../types/index.js';
import { v4 as uuid } from 'uuid';
import fs from 'fs';

let _claudeAvailable: boolean | null = null;

/** Check if the configured Claude CLI is executable. Result is cached. */
export function isClaudeAvailable(): boolean {
  if (_claudeAvailable !== null) return _claudeAvailable;
  try {
    const result = spawnSync(config.claudePath, ['--version'], {
      stdio: 'ignore',
      timeout: 10000,
      windowsHide: true,
      shell: process.platform === 'win32',
    });
    _claudeAvailable = result.status === 0 && result.error === undefined;
  } catch {
    _claudeAvailable = false;
  }
  if (!_claudeAvailable) {
    console.error(`[RuntimeManager] Claude CLI not found or not executable: ${config.claudePath}`);
    console.error('[RuntimeManager] Install it from: npm install -g @anthropic-ai/claude-code');
  }
  return _claudeAvailable;
}

export interface RuntimeSession {
  sessionId: string;
  workspacePath: string;
  proc: ChildProcess;
  parser: StreamParser;
  onEvent: (event: RuntimeEvent) => void;
  onExit: (sessionId: string) => void;
  createdAt: number;
  heartbeatAt: number;
  cleanedUp?: boolean;
}

const sessions = new Map<string, RuntimeSession>();

export class RuntimeManager {
  /** Spawn a new Claude process for the given session */
  static spawn(
    sessionId: string,
    workspacePath: string,
    onEvent: (event: RuntimeEvent) => void,
    onExit: (sessionId: string) => void,
  ): RuntimeSession {
    if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath, { recursive: true });
    }

    if (!isClaudeAvailable()) {
      const msg = `Claude CLI not found (${config.claudePath}). Install: npm install -g @anthropic-ai/claude-code`;
      console.error(`[RuntimeManager] ${msg}`);
      // Emit error and call onExit asynchronously so callers can finish setup first
      setImmediate(() => {
        onEvent({
          id: uuid(),
          sessionId,
          type: 'error',
          payload: { message: msg },
          createdAt: Date.now(),
        });
        onExit(sessionId);
      });
      // Return a dummy runtime session so callers don't crash
      return {
        sessionId,
        workspacePath,
        proc: null as unknown as ChildProcess,
        parser: null as unknown as StreamParser,
        onEvent,
        onExit,
        createdAt: Date.now(),
        heartbeatAt: Date.now(),
      };
    }

    console.log(`[RuntimeManager] Spawning Claude: sessionId=${sessionId.slice(0, 8)} cwd=${workspacePath} cmd=${config.claudePath}`);

    const parser = new StreamParser();

    const args = [
      '--print',
      '--output-format', 'stream-json',
      '--input-format', 'stream-json',
      '--include-partial-messages',
      '--replay-user-messages',
      '--session-id', sessionId,
      '--verbose',
    ];
    if (config.dangerouslySkipPermissions) {
      args.push('--dangerously-skip-permissions');
    }

    const proc = spawn(config.claudePath, args, {
      cwd: workspacePath,
      env: {
        ...process.env,
        TERM: 'dumb',
        NO_COLOR: '1',
        CLICOLOR: '0',
        FORCE_COLOR: '0',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: process.platform === 'win32',
    });

    const runtime: RuntimeSession = {
      sessionId,
      workspacePath,
      proc,
      parser,
      onEvent,
      onExit,
      createdAt: Date.now(),
      heartbeatAt: Date.now(),
    };

    sessions.set(sessionId, runtime);

    // Read stdout and parse stream-json
    if (proc.stdout) {
      proc.stdout.setEncoding('utf-8');
      proc.stdout.on('data', (data: string) => {
        runtime.heartbeatAt = Date.now();
        parser.feed(data);
      });
    }

    // Read stderr for errors
    if (proc.stderr) {
      proc.stderr.setEncoding('utf-8');
      proc.stderr.on('data', (data: string) => {
        // Stderr from Claude may contain progress info
        // Log it but don't try to parse as JSON
        console.error(`[Claude stderr][${sessionId.slice(0, 8)}] ${data.trim()}`);
      });
    }

    // Handle process errors (e.g., claude not found)
    proc.on('error', (err: NodeJS.ErrnoException) => {
      RuntimeManager.emitEvent(runtime, {
        id: uuid(),
        sessionId,
        type: 'error',
        payload: {
          message: err.code === 'ENOENT'
            ? `Claude CLI not found. Please install Claude Code CLI first. (${config.claudePath})`
            : `Process error: ${err.message}`,
        },
        createdAt: Date.now(),
      });
      sessions.delete(sessionId);
      onExit(sessionId);
    });

    // Handle process exit
    proc.on('close', (exitCode, signal) => {
      RuntimeManager.emitEvent(runtime, {
        id: uuid(),
        sessionId,
        type: 'session.closed',
        payload: { exitCode, signal },
        createdAt: Date.now(),
      });
      sessions.delete(sessionId);
      if (!runtime.cleanedUp) {
        onExit(sessionId);
      }
    });

    // Wire up stream parser to translate Claude events → Runtime events
    RuntimeManager.wireParser(runtime);

    RuntimeManager.emitEvent(runtime, {
      id: uuid(),
      sessionId,
      type: 'session.started',
      payload: { workspacePath },
      createdAt: Date.now(),
    });

    return runtime;
  }

  /** Send input to the Claude process in stream-json format */
  static write(sessionId: string, text: string): void {
    const session = sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    if (session.proc.stdin) {
      const msg = JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text }],
        },
      }) + '\n';
      session.proc.stdin.write(msg);
      session.heartbeatAt = Date.now();
    }
  }

  /** Resize is not supported with child_process.spawn (no-op) */
  static resize(_sessionId: string, _cols: number, _rows: number): void {
    // Not supported with child_process.spawn
  }

  /** Check if a session is still active */
  static isActive(sessionId: string): boolean {
    const session = sessions.get(sessionId);
    if (!session) return false;
    return !session.proc.killed && session.proc.exitCode === null;
  }

  /** Get session info */
  static getSession(sessionId: string): RuntimeSession | undefined {
    return sessions.get(sessionId);
  }

  /** Kill a session's Claude process */
  static kill(sessionId: string): void {
    const session = sessions.get(sessionId);
    if (session) {
      session.cleanedUp = true;
      session.proc.kill();
      sessions.delete(sessionId);
    }
  }

  /** Get all active session IDs */
  static getActiveSessions(): string[] {
    return Array.from(sessions.keys());
  }

  /** Clean up stale sessions */
  static cleanup(timeout: number = config.sessionTimeout): void {
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (now - session.heartbeatAt > timeout) {
        session.cleanedUp = true;
        session.proc.kill();
        sessions.delete(id);
      }
    }
  }

  // --- Stream event wiring ---

  private static wireParser(runtime: RuntimeSession): void {
    // content_block_delta — streaming text tokens
    runtime.parser.on('content_block_delta', (ev: ClaudeStreamEvent) => {
      if (ev.delta?.text) {
        RuntimeManager.emitEvent(runtime, {
          id: uuid(),
          sessionId: runtime.sessionId,
          type: 'assistant.delta',
          payload: { delta: ev.delta.text },
          createdAt: Date.now(),
        });
      }
    });

    // stream_event — wrapped events from newer Claude CLI versions
    runtime.parser.on('stream_event', (ev: ClaudeStreamEvent) => {
      const inner = ev.event || ev;
      RuntimeManager.dispatchInner(runtime, inner);
    });

    // assistant block - only handle tool_use, text is handled by content_block_delta
    runtime.parser.on('assistant', (ev: ClaudeStreamEvent) => {
      if (ev.message?.content) {
        for (const block of ev.message.content) {
          if (block.type === 'tool_use') {
            RuntimeManager.emitEvent(runtime, {
              id: uuid(),
              sessionId: runtime.sessionId,
              type: 'tool.call',
              payload: { toolId: block.id, tool: block.name, input: block.input },
              createdAt: Date.now(),
            });
          }
        }
      }
    });

    // tool_use
    runtime.parser.on('tool_use', (ev: ClaudeStreamEvent) => {
      RuntimeManager.emitEvent(runtime, {
        id: uuid(),
        sessionId: runtime.sessionId,
        type: 'tool.call',
        payload: { toolId: ev.id || uuid(), tool: ev.name || 'unknown', input: ev.input || {} },
        createdAt: Date.now(),
      });
    });

    // tool_result
    runtime.parser.on('tool_result', (ev: ClaudeStreamEvent) => {
      const content = ev.content;
      let result: any = content;
      if (Array.isArray(content)) {
        result = content.map((c: any) => c.text || '').join('\n');
      } else if (typeof content === 'string') {
        result = content;
      }
      RuntimeManager.emitEvent(runtime, {
        id: uuid(),
        sessionId: runtime.sessionId,
        type: 'tool.result',
        payload: { toolId: ev.tool_use_id || '', result },
        createdAt: Date.now(),
      });
    });

    // user block — may contain tool results
    runtime.parser.on('user', (ev: ClaudeStreamEvent) => {
      if (ev.message?.content) {
        for (const block of ev.message.content) {
          if (block.type === 'tool_result') {
            const content = block.content;
            let text = '';
            if (typeof content === 'string') {
              text = content;
            } else if (Array.isArray(content)) {
              text = content.map((c: any) => c.text || '').join('\n');
            }
            RuntimeManager.emitEvent(runtime, {
              id: uuid(),
              sessionId: runtime.sessionId,
              type: 'tool.stdout',
              payload: { toolId: block.tool_use_id || '', stream: 'stdout', delta: text },
              createdAt: Date.now(),
            });
          }
        }
      }
    });

    // content_block_start — tool call initiation
    runtime.parser.on('content_block_start', (ev: ClaudeStreamEvent) => {
      if (ev.content_block?.type === 'tool_use') {
        const cb = ev.content_block;
        RuntimeManager.emitEvent(runtime, {
          id: uuid(),
          sessionId: runtime.sessionId,
          type: 'tool.call',
          payload: { toolId: cb.id || uuid(), tool: cb.name || 'unknown', input: cb.input || {} },
          createdAt: Date.now(),
        });
      }
    });

    // Track if we've already sent completion for this turn
    let completionSent = false;

    // message_stop — end of assistant message
    runtime.parser.on('message_stop', (_ev: ClaudeStreamEvent) => {
      if (!completionSent) {
        completionSent = true;
        RuntimeManager.emitEvent(runtime, {
          id: uuid(),
          sessionId: runtime.sessionId,
          type: 'assistant.completed',
          payload: {},
          createdAt: Date.now(),
        });
        // Reset for next turn
        setTimeout(() => { completionSent = false; }, 100);
      }
    });

    // result — final turn result (fallback in case message_stop doesn't fire)
    runtime.parser.on('result', (_ev: ClaudeStreamEvent) => {
      if (!completionSent) {
        completionSent = true;
        RuntimeManager.emitEvent(runtime, {
          id: uuid(),
          sessionId: runtime.sessionId,
          type: 'assistant.completed',
          payload: {},
          createdAt: Date.now(),
        });
        // Reset for next turn
        setTimeout(() => { completionSent = false; }, 100);
      }
    });

    // error
    runtime.parser.on('error', (ev: ClaudeStreamEvent) => {
      RuntimeManager.emitEvent(runtime, {
        id: uuid(),
        sessionId: runtime.sessionId,
        type: 'error',
        payload: { message: ev.message || ev.error || 'Unknown error' },
        createdAt: Date.now(),
      });
    });
  }

  private static dispatchInner(runtime: RuntimeSession, ev: ClaudeStreamEvent): void {
    if (ev.type === 'content_block_delta' && ev.delta?.text) {
      RuntimeManager.emitEvent(runtime, {
        id: uuid(),
        sessionId: runtime.sessionId,
        type: 'assistant.delta',
        payload: { delta: ev.delta.text },
        createdAt: Date.now(),
      });
    }
  }

  private static emitEvent(runtime: RuntimeSession, event: RuntimeEvent): void {
    try {
      runtime.onEvent(event);
    } catch {
      // Don't let handler errors crash the process
    }
  }
}

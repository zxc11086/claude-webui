import pty from 'node-pty';
import { config } from '../config.js';
import { StreamParser } from './stream-parser.js';
import { RuntimeEvent, ClaudeStreamEvent } from '../types/index.js';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import path from 'path';

export interface RuntimeSession {
  sessionId: string;
  workspacePath: string;
  proc: pty.IPty;
  parser: StreamParser;
  onEvent: (event: RuntimeEvent) => void;
  onExit: (sessionId: string) => void;
  createdAt: number;
  heartbeatAt: number;
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

    const parser = new StreamParser();

    const proc = pty.spawn(config.claudePath, ['--output', 'stream-json'], {
      name: 'xterm-color',
      cols: 200,
      rows: 60,
      cwd: workspacePath,
      env: {
        ...process.env,
        TERM: 'xterm-color',
      },
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

    // Parse PTY output through stream parser
    proc.onData((data: string) => {
      runtime.heartbeatAt = Date.now();
      parser.feed(data);
    });

    proc.onExit(({ exitCode, signal }) => {
      RuntimeManager.emitEvent(runtime, {
        id: uuid(),
        sessionId,
        type: 'session.closed',
        payload: { exitCode, signal },
        createdAt: Date.now(),
      });
      sessions.delete(sessionId);
      onExit(sessionId);
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

  /** Send input to the Claude process */
  static write(sessionId: string, text: string): void {
    const session = sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    session.proc.write(text + '\r\n');
    session.heartbeatAt = Date.now();
  }

  /** Send an approval response to the Claude process */
  static approve(sessionId: string, requestId: string, approved: boolean): void {
    const session = sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    const response = approved ? 'yes' : 'no';
    // Claude CLI typically uses stdin to receive approval responses
    session.proc.write(response + '\r\n');
    session.heartbeatAt = Date.now();
  }

  /** Resize PTY terminal */
  static resize(sessionId: string, cols: number, rows: number): void {
    const session = sessions.get(sessionId);
    if (session) {
      session.proc.resize(cols, rows);
    }
  }

  /** Check if a session is still active */
  static isActive(sessionId: string): boolean {
    return sessions.has(sessionId);
  }

  /** Get session info */
  static getSession(sessionId: string): RuntimeSession | undefined {
    return sessions.get(sessionId);
  }

  /** Kill a session's Claude process */
  static kill(sessionId: string): void {
    const session = sessions.get(sessionId);
    if (session) {
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
        session.proc.kill();
        sessions.delete(id);
      }
    }
  }

  /** Map Claude stream events to internal Runtime events */
  private static wireParser(runtime: RuntimeSession): void {
    // Assistant delta — streaming text
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

    // Catch-all: also handle stream_event type (wrapped events)
    runtime.parser.on('stream_event', (ev: ClaudeStreamEvent) => {
      const inner = ev.event || ev;
      RuntimeManager.dispatchInner(runtime, inner);
    });

    // Direct events (not wrapped)
    runtime.parser.on('assistant', (ev: ClaudeStreamEvent) => {
      // Handle assistant message blocks
      if (ev.message?.content) {
        for (const block of ev.message.content) {
          if (block.type === 'text' && block.text) {
            RuntimeManager.emitEvent(runtime, {
              id: uuid(),
              sessionId: runtime.sessionId,
              type: 'assistant.delta',
              payload: { delta: block.text },
              createdAt: Date.now(),
            });
          } else if (block.type === 'tool_use') {
            RuntimeManager.emitEvent(runtime, {
              id: uuid(),
              sessionId: runtime.sessionId,
              type: 'tool.call',
              payload: {
                toolId: block.id,
                tool: block.name,
                input: block.input,
              },
              createdAt: Date.now(),
            });
          }
        }
      }
    });

    // Tool use events
    runtime.parser.on('tool_use', (ev: ClaudeStreamEvent) => {
      RuntimeManager.emitEvent(runtime, {
        id: uuid(),
        sessionId: runtime.sessionId,
        type: 'tool.call',
        payload: {
          toolId: ev.id || uuid(),
          tool: ev.name || 'unknown',
          input: ev.input || {},
        },
        createdAt: Date.now(),
      });
    });

    // Tool result events
    runtime.parser.on('tool_result', (ev: ClaudeStreamEvent) => {
      const content = ev.content;
      let result: any = content;
      // If it's a string or array, keep as-is
      if (Array.isArray(content)) {
        result = content.map((c: any) => c.text || '').join('\n');
      } else if (typeof content === 'string') {
        result = content;
      }
      RuntimeManager.emitEvent(runtime, {
        id: uuid(),
        sessionId: runtime.sessionId,
        type: 'tool.result',
        payload: {
          toolId: ev.tool_use_id || '',
          result,
        },
        createdAt: Date.now(),
      });
    });

    // User/tool events (for detecting shell output)
    runtime.parser.on('user', (ev: ClaudeStreamEvent) => {
      // user events may contain tool results with shell output
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
              payload: {
                toolId: block.tool_use_id || '',
                stream: 'stdout',
                delta: text,
              },
              createdAt: Date.now(),
            });
          }
        }
      }
    });

    // Generic handler for raw content delta (common pattern)
    runtime.parser.on('content_block_start', (ev: ClaudeStreamEvent) => {
      if (ev.content_block?.type === 'tool_use') {
        const cb = ev.content_block;
        RuntimeManager.emitEvent(runtime, {
          id: uuid(),
          sessionId: runtime.sessionId,
          type: 'tool.call',
          payload: {
            toolId: cb.id || uuid(),
            tool: cb.name || 'unknown',
            input: cb.input || {},
          },
          createdAt: Date.now(),
        });
      }
    });

    // Error handling
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
    // Handle nested stream events
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

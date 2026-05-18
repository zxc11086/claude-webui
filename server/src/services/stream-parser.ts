import { ClaudeStreamEvent } from '../types/index.js';

/**
 * Buffered stream-json parser for Claude CLI output.
 *
 * Claude outputs one JSON object per line, but PTY chunks may split
 * lines at arbitrary boundaries. This parser buffers partial lines
 * and emits complete JSON objects.
 */
export class StreamParser {
  private buffer = '';
  private handlers: Map<string, Array<(event: ClaudeStreamEvent) => void>> = new Map();

  /** Feed a raw chunk from PTY stdout */
  feed(chunk: string): void {
    this.buffer += chunk;

    const lines = this.buffer.split('\n');
    // Last element may be incomplete — keep it in the buffer
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event: ClaudeStreamEvent = JSON.parse(line);
        this.emit(event.type, event);
        this.emit('*', event);
      } catch {
        // Skip malformed lines (ANSI codes mixed in, etc.)
      }
    }
  }

  on(type: string, handler: (event: ClaudeStreamEvent) => void): void {
    const existing = this.handlers.get(type) || [];
    existing.push(handler);
    this.handlers.set(type, existing);
  }

  off(type: string, handler: (event: ClaudeStreamEvent) => void): void {
    const existing = this.handlers.get(type);
    if (existing) {
      this.handlers.set(type, existing.filter(h => h !== handler));
    }
  }

  private emit(type: string, event: ClaudeStreamEvent): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        handler(event);
      }
    }
  }

  reset(): void {
    this.buffer = '';
    this.handlers.clear();
  }
}

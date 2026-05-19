import { v4 as uuid } from 'uuid';
import path from 'path';
import fs from 'fs';
import { config } from '../config.js';
import { RuntimeManager, RuntimeSession } from './runtime-manager.js';
import { RuntimeEvent, Message } from '../types/index.js';
import * as db from '../db/index.js';

export interface SessionCallbacks {
  onEvent: (sessionId: string, event: RuntimeEvent) => void;
  onSessionClosed: (sessionId: string) => void;
}

export class SessionService {
  private callbacks: SessionCallbacks;

  constructor(callbacks: SessionCallbacks) {
    this.callbacks = callbacks;
    this.startCleanupInterval();
  }

  /** Create a new session in a workspace */
  createSession(workspaceId: string, userId = 'default'): { sessionId: string; workspacePath: string } {
    console.log(`[SessionService] Creating session: workspaceId=${workspaceId} userId=${userId}`);
    const workspace = db.getWorkspace(workspaceId);
    if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

    const sessionId = uuid();
    const now = Date.now();

    // Persist session to database
    db.createSession({
      id: sessionId,
      workspaceId,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });

    // Spawn Claude process
    RuntimeManager.spawn(
      sessionId,
      workspace.path,
      (event) => this.callbacks.onEvent(sessionId, event),
      (id) => {
        db.updateSessionStatus(id, 'closed');
        this.callbacks.onSessionClosed(id);
      },
    );

    return { sessionId, workspacePath: workspace.path };
  }

  /** Ensure a default workspace exists for a user */
  ensureDefaultWorkspace(userId = 'default'): string {
    const existing = db.getWorkspacesByUser(userId);
    if (existing.length > 0) return existing[0].id;

    const wsId = uuid();
    const wsPath = path.resolve(config.workspacesRoot, userId, 'default');

    db.createWorkspace({
      id: wsId,
      userId,
      name: 'default',
      path: wsPath,
      createdAt: Date.now(),
    });

    return wsId;
  }

  /** Send user message to a Claude session */
  sendMessage(sessionId: string, content: string): Message {
    const msg: Message = {
      id: uuid(),
      sessionId,
      role: 'user',
      content,
      createdAt: Date.now(),
    };
    db.createMessage(msg);

    // Write to Claude process stdin
    RuntimeManager.write(sessionId, content);

    return msg;
  }

  /** Handle approval request */
  handleApproval(sessionId: string, requestId: string, approved: boolean): void {
    RuntimeManager.approve(sessionId, requestId, approved);
  }

  /** Save an event as a message if it's significant */
  saveEventAsMessage(sessionId: string, event: RuntimeEvent): void {
    if (event.type === 'assistant.delta') {
      // We accumulate deltas into message via the frontend, don't save individually
      return;
    }
    if (event.type === 'tool.stdout') {
      db.createMessage({
        id: uuid(),
        sessionId,
        role: 'tool',
        content: JSON.stringify(event.payload),
        createdAt: Date.now(),
      });
    }
  }

  /** Save a completed assistant message */
  saveAssistantMessage(sessionId: string, fullContent: string): Message {
    const msg: Message = {
      id: uuid(),
      sessionId,
      role: 'assistant',
      content: fullContent,
      createdAt: Date.now(),
    };
    db.createMessage(msg);
    return msg;
  }

  /** Get session info */
  getSession(sessionId: string) {
    return db.getSession(sessionId);
  }

  /** Get messages for a session */
  getMessages(sessionId: string, limit = 200): Message[] {
    return db.getMessagesBySession(sessionId, limit);
  }

  /** Get sessions for a workspace */
  getSessions(workspaceId: string) {
    return db.getSessionsByWorkspace(workspaceId);
  }

  /** Kill a session */
  killSession(sessionId: string): void {
    RuntimeManager.kill(sessionId);
    db.updateSessionStatus(sessionId, 'closed');
  }

  /** Resize PTY for a session */
  resizeSession(sessionId: string, cols: number, rows: number): void {
    RuntimeManager.resize(sessionId, cols, rows);
  }

  /** Check if a session's Claude process is active */
  isSessionActive(sessionId: string): boolean {
    return RuntimeManager.isActive(sessionId);
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      RuntimeManager.cleanup();
    }, config.processCleanupInterval);
  }
}

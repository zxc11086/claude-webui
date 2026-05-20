import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { config } from '../config.js';
import { SessionService } from '../services/session-service.js';
import { AuthService } from '../services/auth-service.js';
import { isClaudeAvailable } from '../services/runtime-manager.js';

interface ConnectedClient {
  socket: Socket;
  sessionId: string | null;
  userId: string;
}

const clients = new Map<string, ConnectedClient>();
const authService = new AuthService();

export function createSocketServer(httpServer: HttpServer, sessionService: SessionService): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000', 'http://localhost:5174'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: 15000,
    pingTimeout: 30000,
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const payload = authService.verifyToken(token);
      (socket as any).userId = payload.userId;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = (socket as any).userId;
    const client: ConnectedClient = {
      socket,
      sessionId: null,
      userId,
    };
    clients.set(socket.id, client);

    // Ensure default workspace exists
    const workspaceId = sessionService.ensureDefaultWorkspace(userId);

    // Send initial workspaces and sessions
    socket.emit('workspace.init', {
      workspaceId,
      sessions: sessionService.getSessions(workspaceId),
    });

    // --- Handle client events ---

    socket.on('chat.send', (data: { sessionId: string; content: string }) => {
      handleChatSend(socket, client, data, sessionService);
    });

    socket.on('session.create', (data: { workspaceId: string }) => {
      if (!isClaudeAvailable()) {
        socket.emit('error', {
          sessionId: '',
          message: `Claude CLI (${config.claudePath}) 未找到。请先安装: npm install -g @anthropic-ai/claude-code`,
        });
        return;
      }
      handleSessionCreate(socket, client, data.workspaceId, sessionService);
    });

    socket.on('session.resume', (data: { sessionId: string }) => {
      handleSessionResume(socket, client, data.sessionId, sessionService);
    });

    socket.on('session.close', (data: { sessionId: string }) => {
      handleSessionClose(socket, client, data.sessionId, sessionService);
    });

    socket.on('disconnect', () => {
      clients.delete(socket.id);
    });
  });

  return io;
}

function handleChatSend(
  socket: Socket,
  client: ConnectedClient,
  data: { sessionId: string; content: string },
  sessionService: SessionService,
): void {
  const { sessionId, content } = data;

  if (!sessionService.isSessionActive(sessionId)) {
    socket.emit('error', { sessionId, message: 'Session is not active. Create a new session first.' });
    return;
  }

  client.sessionId = sessionId;
  const msg = sessionService.sendMessage(sessionId, content);

  // Echo back the user message
  socket.emit('user.message', { id: msg.id, sessionId, content, createdAt: msg.createdAt });
}

function handleSessionCreate(
  socket: Socket,
  client: ConnectedClient,
  workspaceId: string,
  sessionService: SessionService,
): void {
  console.log(`[Socket] session.create requested: workspaceId=${workspaceId}, userId=${client.userId}`);
  const { sessionId, workspacePath } = sessionService.createSession(workspaceId, client.userId);
  client.sessionId = sessionId;
  console.log(`[Socket] session.created: sessionId=${sessionId}, workspacePath=${workspacePath}`);

  socket.emit('session.created', { sessionId, workspaceId, workspacePath });
}

function handleSessionResume(
  socket: Socket,
  client: ConnectedClient,
  sessionId: string,
  sessionService: SessionService,
): void {
  const session = sessionService.getSession(sessionId);
  if (!session) {
    socket.emit('error', { sessionId, message: 'Session not found' });
    return;
  }

  client.sessionId = sessionId;
  const messages = sessionService.getMessages(sessionId);
  socket.emit('session.resumed', { sessionId, messages });
}

function handleSessionClose(
  socket: Socket,
  client: ConnectedClient,
  sessionId: string,
  sessionService: SessionService,
): void {
  console.log(`[Socket] session.close requested: sessionId=${sessionId}`);
  sessionService.killSession(sessionId);
  if (client.sessionId === sessionId) {
    client.sessionId = null;
  }
  socket.emit('session.closed', { sessionId, reason: 'user_requested' });
  console.log(`[Socket] session.closed emitted: sessionId=${sessionId}`);
}
export { clients };

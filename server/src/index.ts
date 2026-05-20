import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { config } from './config.js';
import { SessionService } from './services/session-service.js';
import { createSocketServer, clients } from './socket/index.js';
import { createSessionRoutes } from './routes/sessions.js';
import { createWorkspaceRoutes } from './routes/workspaces.js';
import { createAuthRoutes } from './routes/auth.js';
import { createAdminRoutes } from './routes/admin.js';
import { RuntimeEvent } from './types/index.js';
import { isClaudeAvailable } from './services/runtime-manager.js';
import { Server as SocketServer } from 'socket.io';

// --- Bootstrap ---

const app = express();
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000', 'http://localhost:5174'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

const httpServer = createServer(app);

// Active message accumulators: sessionId → accumulated text
const messageAccumulators = new Map<string, string>();

// --- Session Service ---

const sessionService = new SessionService({
  onEvent(sessionId: string, event: RuntimeEvent) {
    handleRuntimeEvent(io, sessionId, event);
  },
  onSessionClosed(sessionId: string) {
    io.emit('session.closed', { sessionId, reason: 'process_exited' });
    // Save accumulated assistant message if any
    const accumulated = messageAccumulators.get(sessionId);
    if (accumulated) {
      sessionService.saveAssistantMessage(sessionId, accumulated);
      messageAccumulators.delete(sessionId);
    }
  },
});

// --- Socket.IO ---

const io = createSocketServer(httpServer, sessionService);

// --- REST API ---

app.use('/api/auth', createAuthRoutes());
app.use('/api/admin', createAdminRoutes());
app.use('/api/sessions', createSessionRoutes(sessionService));
app.use('/api/workspaces', createWorkspaceRoutes());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    activeSessions: sessionService.getSessions('default').length,
  });
});

// --- Runtime Event → Socket.IO bridge ---

function handleRuntimeEvent(io: SocketServer, sessionId: string, event: RuntimeEvent): void {
  switch (event.type) {
    case 'session.started': {
      io.emit('session.started', { sessionId, ...event.payload });
      break;
    }

    case 'assistant.delta': {
      // Accumulate deltas
      const current = messageAccumulators.get(sessionId) || '';
      const delta = event.payload.delta || '';
      messageAccumulators.set(sessionId, current + delta);

      // Broadcast to all clients
      io.emit('assistant.delta', { sessionId, delta });
      break;
    }

    case 'tool.call': {
      io.emit('tool.call', {
        sessionId,
        toolId: event.payload.toolId,
        tool: event.payload.tool,
        input: event.payload.input,
      });
      break;
    }

    case 'tool.stdout': {
      io.emit('tool.stdout', {
        sessionId,
        toolId: event.payload.toolId,
        stream: event.payload.stream || 'stdout',
        delta: event.payload.delta,
      });
      break;
    }

    case 'tool.result': {
      io.emit('tool.result', {
        sessionId,
        toolId: event.payload.toolId,
        result: event.payload.result,
      });
      break;
    }

    case 'tool.stderr': {
      io.emit('tool.stderr', {
        sessionId,
        toolId: event.payload.toolId,
        delta: event.payload.delta,
      });
      break;
    }

    case 'error': {
      io.emit('error', {
        sessionId,
        message: event.payload.message,
      });
      break;
    }

    case 'file.updated': {
      io.emit('file.updated', {
        sessionId,
        path: event.payload.path,
        patch: event.payload.patch,
      });
      break;
    }

    case 'assistant.completed': {
      io.emit('assistant.completed', { sessionId });
      // Save accumulated assistant message
      const accumulated = messageAccumulators.get(sessionId);
      if (accumulated) {
        sessionService.saveAssistantMessage(sessionId, accumulated);
        messageAccumulators.set(sessionId, '');
      }
      break;
    }

    case 'session.closed': {
      io.emit('session.closed', { sessionId, reason: 'process_exited' });
      // Finalize accumulated message
      const accumulated = messageAccumulators.get(sessionId);
      if (accumulated) {
        sessionService.saveAssistantMessage(sessionId, accumulated);
        messageAccumulators.delete(sessionId);
      }
      break;
    }

    default:
      break;
  }
}

// --- Start ---

function startServer(port: number, retries = 0): void {
  httpServer.listen(port, config.host, () => {
    console.log(`[Claude WebUI Server] running on http://${config.host}:${port}`);
    console.log(`[Claude WebUI Server] WebSocket ready`);
    console.log(`[Claude WebUI Server] Workspaces root: ${config.workspacesRoot}`);

    const wsId = sessionService.ensureDefaultWorkspace();
    console.log(`[Claude WebUI Server] Default workspace: ${wsId}`);
  });

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      if (retries < 3) {
        const nextPort = port + 1;
        console.log(`[Claude WebUI Server] Port ${port} is in use, trying ${nextPort}...`);
        httpServer.close();
        startServer(nextPort, retries + 1);
      } else {
        console.error(`[Claude WebUI Server] Ports ${config.port}-${config.port + 3} are all in use.`);
        console.error('[Claude WebUI Server] Please free a port or set the PORT environment variable.');
        process.exit(1);
      }
    } else {
      throw err;
    }
  });
}

// Pre-flight: check Claude CLI availability
console.log(`[Claude WebUI Server] Checking Claude CLI: ${config.claudePath}`);
const claudeOk = isClaudeAvailable();
console.log(`[Claude WebUI Server] Claude CLI available: ${claudeOk}`);

startServer(config.port);

// Graceful shutdown
function shutdown() {
  console.log('\n[Claude WebUI Server] Shutting down...');
  io.close();
  httpServer.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export { app, httpServer, io, sessionService };

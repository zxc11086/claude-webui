import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import * as db from '../db/index.js';
import { SessionService } from '../services/session-service.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

export function createSessionRoutes(sessionService: SessionService): Router {
  const router = Router();

  // GET /sessions/:id
  router.get('/:id', authMiddleware, (req: AuthRequest, res: Response) => {
    const session = sessionService.getSession(req.params.id as string);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const workspace = db.getWorkspace(session.workspaceId);
    if (!workspace || workspace.userId !== req.user!.userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    res.json(session);
  });

  // GET /sessions/:id/messages
  router.get('/:id/messages', authMiddleware, (req: AuthRequest, res: Response) => {
    const session = sessionService.getSession(req.params.id as string);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const workspace = db.getWorkspace(session.workspaceId);
    if (!workspace || workspace.userId !== req.user!.userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const limit = parseInt(req.query.limit as string) || 200;
    const messages = sessionService.getMessages(req.params.id as string, limit);
    res.json(messages);
  });

  // DELETE /sessions/:id
  router.delete('/:id', authMiddleware, (req: AuthRequest, res: Response) => {
    const session = sessionService.getSession(req.params.id as string);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const workspace = db.getWorkspace(session.workspaceId);
    if (!workspace || workspace.userId !== req.user!.userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    sessionService.killSession(req.params.id as string);
    res.json({ success: true });
  });

  return router;
}

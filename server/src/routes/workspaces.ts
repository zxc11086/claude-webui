import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import * as db from '../db/index.js';
import path from 'path';
import { config } from '../config.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

export function createWorkspaceRoutes(): Router {
  const router = Router();

  // GET /workspaces
  router.get('/', authMiddleware, (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const workspaces = db.getWorkspacesByUser(userId);
    res.json(workspaces);
  });

  // POST /workspaces
  router.post('/', authMiddleware, (req: AuthRequest, res: Response) => {
    const { name } = req.body || {};
    const userId = req.user!.userId;
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const id = uuid();
    const wsPath = path.resolve(config.workspacesRoot, userId, name);

    const workspace = db.createWorkspace({
      id,
      userId,
      name,
      path: wsPath,
      createdAt: Date.now(),
    });

    res.status(201).json(workspace);
  });

  // GET /workspaces/:id
  router.get('/:id', authMiddleware, (req: AuthRequest, res: Response) => {
    const workspace = db.getWorkspace(req.params.id as string);
    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    if (workspace.userId !== req.user!.userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    res.json(workspace);
  });

  // GET /workspaces/:id/sessions
  router.get('/:id/sessions', authMiddleware, (req: AuthRequest, res: Response) => {
    const workspace = db.getWorkspace(req.params.id as string);
    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    if (workspace.userId !== req.user!.userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const sessions = db.getSessionsByWorkspace(req.params.id as string);
    res.json(sessions);
  });

  return router;
}

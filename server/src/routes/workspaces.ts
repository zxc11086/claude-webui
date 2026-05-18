import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import * as db from '../db/index.js';
import path from 'path';
import { config } from '../config.js';

export function createWorkspaceRoutes(): Router {
  const router = Router();

  // GET /workspaces
  router.get('/', (req: Request, res: Response) => {
    const userId = (req.query.userId as string) || 'default';
    const workspaces = db.getWorkspacesByUser(userId);
    res.json(workspaces);
  });

  // POST /workspaces
  router.post('/', (req: Request, res: Response) => {
    const { name } = req.body || {};
    const userId = req.body?.userId || 'default';
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
  router.get('/:id', (req: Request, res: Response) => {
    const workspace = db.getWorkspace(req.params.id as string);
    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    res.json(workspace);
  });

  // GET /workspaces/:id/sessions
  router.get('/:id/sessions', (req: Request, res: Response) => {
    const sessions = db.getSessionsByWorkspace(req.params.id as string);
    res.json(sessions);
  });

  return router;
}

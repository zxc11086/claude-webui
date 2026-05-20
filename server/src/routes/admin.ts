import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getAllUsers, deleteUser } from '../db/user-queries.js';
import * as db from '../db/index.js';

function adminMiddleware(req: AuthRequest, res: Response, next: Function): void {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

export function createAdminRoutes(): Router {
  const router = Router();

  router.use(authMiddleware);
  router.use(adminMiddleware);

  // GET /admin/users - 获取所有用户
  router.get('/users', (req: AuthRequest, res: Response) => {
    const users = getAllUsers().map(u => ({
      id: u.id,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
    }));
    res.json(users);
  });

  // DELETE /admin/users/:id - 删除用户
  router.delete('/users/:id', (req: AuthRequest, res: Response) => {
    const userId = req.params.id;
    
    if (userId === req.user!.userId) {
      res.status(400).json({ error: 'Cannot delete yourself' });
      return;
    }

    // 删除用户的所有workspaces
    const workspaces = db.getWorkspacesByUser(userId);
    for (const ws of workspaces) {
      const sessions = db.getSessionsByWorkspace(ws.id);
      for (const session of sessions) {
        // 这里可以添加清理session的逻辑
      }
    }

    deleteUser(userId);
    res.json({ success: true });
  });

  // GET /admin/stats - 获取统计信息
  router.get('/stats', (req: AuthRequest, res: Response) => {
    const users = getAllUsers();
    const allWorkspaces: any[] = [];
    const allSessions: any[] = [];

    for (const user of users) {
      const workspaces = db.getWorkspacesByUser(user.id);
      allWorkspaces.push(...workspaces);
      for (const ws of workspaces) {
        const sessions = db.getSessionsByWorkspace(ws.id);
        allSessions.push(...sessions);
      }
    }

    res.json({
      totalUsers: users.length,
      totalWorkspaces: allWorkspaces.length,
      totalSessions: allSessions.length,
    });
  });

  return router;
}

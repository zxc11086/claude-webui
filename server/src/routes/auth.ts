import { Router } from 'express';
import { AuthService } from '../services/auth-service.js';
import { LoginRequest, RegisterRequest } from '../types/index.js';

export function createAuthRoutes(): Router {
  const router = Router();
  const authService = new AuthService();

  router.post('/register', async (req, res) => {
    try {
      const data: RegisterRequest = req.body;
      
      if (!data.email || !data.password) {
        res.status(400).json({ error: 'Email and password required' });
        return;
      }

      if (data.password.length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters' });
        return;
      }

      const result = await authService.register(data);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/login', async (req, res) => {
    try {
      const data: LoginRequest = req.body;
      
      if (!data.email || !data.password) {
        res.status(400).json({ error: 'Email and password required' });
        return;
      }

      const result = await authService.login(data);
      res.json(result);
    } catch (err: any) {
      res.status(401).json({ error: err.message });
    }
  });

  return router;
}

import { Router } from 'express';
import { createSharedConversation, getSharedConversation } from '../db/index.js';
import { randomBytes } from 'crypto';

export function createShareRoutes() {
  const router = Router();

  router.post('/', async (req, res) => {
    try {
      const { messages } = req.body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Invalid messages' });
      }

      const shareId = randomBytes(16).toString('hex');
      createSharedConversation(shareId, messages);

      res.json({ shareId });
    } catch (error) {
      console.error('[Share] Create error:', error);
      res.status(500).json({ error: 'Failed to create share' });
    }
  });

  router.get('/:shareId', async (req, res) => {
    try {
      const { shareId } = req.params;
      const messages = getSharedConversation(shareId);

      if (!messages) {
        return res.status(404).json({ error: 'Share not found or expired' });
      }

      res.json({ messages });
    } catch (error) {
      console.error('[Share] Get error:', error);
      res.status(500).json({ error: 'Failed to get share' });
    }
  });

  return router;
}

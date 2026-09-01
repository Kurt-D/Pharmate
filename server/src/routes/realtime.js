import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { subscribeRealtime } from '../services/realtimeEvents.js';

const router = Router();

router.use(requireAuth);

router.get('/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  const unsubscribe = subscribeRealtime(req.user, res);
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 20_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

export default router;

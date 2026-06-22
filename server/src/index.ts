import express, { Request, Response } from 'express';
import cors from 'cors';

const app = express();
const PORT = parseInt(process.env.PORT || '3721', 10);
const HOST = process.env.HOST || '127.0.0.1';

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Server info endpoint
app.get('/api/info', (_req: Request, res: Response) => {
  res.json({
    name: 'smart-space-server',
    version: '0.1.0',
    nodeVersion: process.version,
    platform: process.platform,
    uptime: process.uptime(),
  });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`[SmartSpace Server] Running on http://${HOST}:${PORT}`);
  console.log(`[SmartSpace Server] Health check: http://${HOST}:${PORT}/api/health`);
});

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`[SmartSpace Server] ${signal} received, shutting down...`);
  server.close(() => {
    console.log('[SmartSpace Server] Closed');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGHUP', () => shutdown('SIGHUP'));

import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import dotenv from 'dotenv';
import { getDashboardState, updateNutanix, updateSolarWinds, updateSymphony } from './db';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || '0.0.0.0';
const server = http.createServer(app);

// WebSocket Server
const wss = new WebSocketServer({ server });
const clients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  clients.add(ws);
  
  // Send current state immediately on connection
  try {
    const currentState = getDashboardState();
    ws.send(JSON.stringify({ type: 'FULL_STATE', data: currentState }));
  } catch (err) {
    console.error('Error fetching initial DB state:', err);
  }

  ws.on('message', (message) => {
    try {
      const parsed = JSON.parse(message.toString());
      if (parsed.type === 'REQUEST_FULL_STATE') {
        const currentState = getDashboardState();
        ws.send(JSON.stringify({ type: 'FULL_STATE', data: currentState }));
      }
    } catch (err) {
      console.error('Error handling WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
  });
});

// Broadcast helper
function broadcastUpdate(source: string) {
  try {
    const updatedState = getDashboardState();
    const payload = JSON.stringify({
      type: 'METRIC_UPDATE',
      source,
      data: updatedState,
      timestamp: new Date().toISOString()
    });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  } catch (err) {
    console.error('Failed to broadcast updates:', err);
  }
}

// REST Routes
app.get('/api/status', (req, res) => {
  try {
    const state = getDashboardState();
    res.json(state);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/update', (req, res) => {
  const { nutanix, solarwinds, symphony } = req.body;

  try {
    let source = '';
    if (nutanix) {
      updateNutanix(nutanix);
      source = 'nutanix';
    }
    if (solarwinds) {
      updateSolarWinds(solarwinds);
      source = 'solarwinds';
    }
    if (symphony) {
      updateSymphony(symphony);
      source = 'symphony';
    }

    if (source) {
      broadcastUpdate(source);
      res.json({ success: true, message: `Updated data from ${source}` });
    } else {
      res.status(400).json({ error: 'Invalid update payload. Must contain nutanix, solarwinds, or symphony object.' });
    }
  } catch (err: any) {
    console.error('Error processing update:', err);
    res.status(500).json({ error: err.message });
  }
});

server.listen(port, host, () => {
  console.log(`API Gateway central hub listening on http://${host}:${port}`);
});

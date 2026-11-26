import { useEffect, useState } from 'react';

import { AGENT_DIAGNOSTICS_POLL_MS } from '../constants.js';
import { transport } from '../transport/index.js';

/** One agent's transcript connection, as the server reports it
 *  (`agentDiagnostics`, the answer to `requestDiagnostics`). */
export interface AgentDiagnostics {
  id: number;
  projectDir: string;
  projectDirExists: boolean;
  jsonlFile: string;
  jsonlExists: boolean;
  fileSize: number;
  fileOffset: number;
  lastDataAt: number;
  linesProcessed: number;
}

/**
 * Every agent's diagnostics, asked for every AGENT_DIAGNOSTICS_POLL_MS while
 * `enabled` (the Debug View always; the activity sidebar while unfolded, and
 * never for a read-only viewer, whose requests the server drops). The answer
 * goes to the asking client only.
 */
export function useAgentDiagnostics(enabled = true): Record<number, AgentDiagnostics> {
  const [diagnostics, setDiagnostics] = useState<Record<number, AgentDiagnostics>>({});

  useEffect(() => {
    if (!enabled) return;
    transport.send({ type: 'requestDiagnostics' });
    const interval = setInterval(() => {
      transport.send({ type: 'requestDiagnostics' });
    }, AGENT_DIAGNOSTICS_POLL_MS);
    return () => clearInterval(interval);
  }, [enabled]);

  // Listen for the diagnostics response via the transport (NOT a raw window
  // 'message' listener): the standalone WebSocket transport delivers messages
  // only to transport.onMessage handlers and never dispatches window events, so
  // a window listener would never fire in standalone mode.
  useEffect(() => {
    if (!enabled) return;
    return transport.onMessage((msg) => {
      if (msg.type === 'agentDiagnostics') {
        const map: Record<number, AgentDiagnostics> = {};
        for (const a of msg.agents as AgentDiagnostics[]) {
          map[a.id] = a;
        }
        setDiagnostics(map);
      }
    });
  }, [enabled]);

  return diagnostics;
}

/** "just now", "12s ago", "3m ago", "2h ago"; 0 (no data yet) is "never". */
export function formatTimeAgo(ms: number): string {
  if (ms === 0) return 'never';
  const seconds = Math.round((Date.now() - ms) / 1000);
  if (seconds < 2) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

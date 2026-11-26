import { clockTime } from '../office/agentActivity.js';
import type { ToolActivity } from '../office/types.js';
import { PixelText } from './ui/PixelText.js';

function ToolDot({ tool }: { tool: ToolActivity }) {
  const color = tool.done
    ? 'bg-status-success'
    : tool.permissionWait
      ? 'bg-status-permission'
      : 'bg-status-active';
  return (
    <span
      className={`w-6 h-6 rounded-full inline-block shrink-0 ${color} ${tool.done ? '' : 'pixel-pulse'}`}
    />
  );
}

/** One tool call of an agent's turn: a dot (done / running / needs approval),
 *  its status text and the time it started. The Debug View and the activity
 *  sidebar both list an agent's turn with it; `compact` is the sidebar's
 *  smaller size. */
export function ToolLine({ tool, compact = false }: { tool: ToolActivity; compact?: boolean }) {
  return (
    <span
      className={`flex items-center gap-5 ${compact ? 'text-xs leading-tight min-w-0' : 'text-base'} ${
        tool.done ? 'opacity-50' : 'opacity-80'
      }`}
    >
      <ToolDot tool={tool} />
      <span className={compact ? 'truncate flex-1 min-w-0' : undefined}>
        {tool.permissionWait && !tool.done ? 'Needs approval' : tool.status}
      </span>
      {tool.startedAt !== undefined && (
        <PixelText
          text={clockTime(tool.startedAt)}
          smaller={compact}
          className="shrink-0 ml-auto text-text-muted"
        />
      )}
    </span>
  );
}

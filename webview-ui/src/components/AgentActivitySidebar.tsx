import { useCallback, useEffect, useState } from 'react';

import { useCast } from '../characters/castStore.js';
import { characterLabel } from '../characters/profiles.js';
import {
  AGENT_ACTIVITY_REFRESH_MS,
  AGENT_ACTIVITY_SIDEBAR_BOTTOM_CLEARANCE_PX,
  AGENT_ACTIVITY_SIDEBAR_GAP_PX,
  AGENT_ACTIVITY_SIDEBAR_SHUT_KEY,
  AGENT_ACTIVITY_SIDEBAR_WIDTH_PX,
  AGENT_ACTIVITY_TOOL_LINES,
  CARD_MUGSHOT_CROP_TOP_ROW,
  TEAM_LEAD_COLOR,
  TEAM_ROLE_COLOR,
  TERMINAL_SIDEBAR_WIDTH_PX,
} from '../constants.js';
import {
  type AgentDiagnostics,
  formatTimeAgo,
  useAgentDiagnostics,
} from '../hooks/useAgentDiagnostics.js';
import { type ActivityRow, buildAgentActivity } from '../office/agentActivity.js';
import type { OfficeState } from '../office/engine/officeState.js';
import type { SubagentCharacter, ToolActivity } from '../office/types.js';
import type { AgentAppearance, TabStatus } from './AgentCard.js';
import { CharacterMugShot } from './CharacterMugShot.js';
import { STATUS_DOT } from './statusDot.js';
import { ToolLine } from './ToolLine.js';
import { PixelIcon } from './ui/PixelIcon.js';

interface AgentActivitySidebarProps {
  officeState: OfficeState;
  /** Main agents, in the card bar's order. */
  cardAgents: number[];
  /** Every agent, teammates included. */
  agents: number[];
  agentTools: Record<number, ToolActivity[]>;
  subagentTools: Record<number, Record<string, ToolActivity[]>>;
  subagentCharacters: SubagentCharacter[];
  /** The agent whose character is selected: its row is highlighted. */
  focusedAgentId: number | null;
  getAppearance: (agentId: number) => AgentAppearance;
  statusFor: (agentId: number) => TabStatus | null;
  /** A row pressed: go to that agent, as its card would. */
  onOpenAgent: (agentId: number) => void;
  /** Poll the Debug View's diagnostics (last data, project dir). Off for a
   *  read-only viewer: the server drops its requests. */
  diagnosticsEnabled: boolean;
}

/**
 * Desktop panel listing every agent in the office with the Directory it runs
 * in and what it is doing right now, without having to hover each one. It
 * reads the Debug View's data: the label's wording (office/agentActivity.ts),
 * the turn's tool calls (agentTools, drawn with the Debug View's ToolLine) and
 * the transcript diagnostics (last data; the project dir names the project
 * when no Directory name came with the agent). Teammates and sub-agents are
 * listed under their lead. Floats top-right over the office, left of the card
 * bar; the header folds it (remembered per browser).
 */
export function AgentActivitySidebar({
  officeState,
  cardAgents,
  agents,
  agentTools,
  subagentTools,
  subagentCharacters,
  focusedAgentId,
  getAppearance,
  statusFor,
  onOpenAgent,
  diagnosticsEnabled,
}: AgentActivitySidebarProps) {
  const [open, setOpen] = useState(() => !storedShut());
  const toggle = useCallback(() => {
    storeShut(open);
    setOpen(!open);
  }, [open]);

  // Bubbles and isActive live on OfficeState (imperative, no React state), so
  // re-read them on a timer while the list is showing.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setTick((n) => n + 1), AGENT_ACTIVITY_REFRESH_MS);
    return () => clearInterval(timer);
  }, [open]);

  const diagnostics = useAgentDiagnostics(open && diagnosticsEnabled);
  const projectDirs: Record<number, string> = {};
  for (const diag of Object.values(diagnostics)) projectDirs[diag.id] = diag.projectDir;

  // A main agent is named after the character it wears, as the roster names it.
  const { profiles } = useCast();
  const groups = buildAgentActivity({
    cardAgents,
    agents,
    characters: officeState.characters,
    agentTools,
    subagentTools,
    subagentCharacters,
    projectDirs,
    characterName: (palette) => characterLabel(profiles[palette], palette),
  });
  const agentCount = groups.reduce(
    (n, g) => n + 1 + g.helpers.filter((h) => h.kind === 'teammate').length,
    0,
  );

  return (
    <aside
      aria-label="Agent activity"
      data-testid="agent-activity-sidebar"
      className="absolute z-20 pixel-panel flex flex-col pointer-events-auto"
      style={{
        top: AGENT_ACTIVITY_SIDEBAR_GAP_PX,
        right: TERMINAL_SIDEBAR_WIDTH_PX + AGENT_ACTIVITY_SIDEBAR_GAP_PX,
        width: AGENT_ACTIVITY_SIDEBAR_WIDTH_PX,
        maxHeight: `calc(100% - ${AGENT_ACTIVITY_SIDEBAR_BOTTOM_CLEARANCE_PX}px)`,
      }}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        title={open ? 'Hide agent activity' : 'Show agent activity'}
        className="flex items-center gap-6 w-full px-8 py-4 text-left bg-transparent border-0 cursor-pointer text-text hover:bg-btn-hover"
      >
        <PixelIcon name={open ? 'down' : 'next'} />
        <span className="flex-1 text-sm leading-none">Agents</span>
        <span className="text-xs leading-none text-text-muted">{agentCount}</span>
      </button>

      {open && (
        <div className="min-h-0 overflow-y-auto border-t-2 border-border">
          {groups.length === 0 ? (
            <p className="m-0 px-8 py-6 text-xs text-text-muted">
              No agents yet. Start Claude Code in a terminal, or press + to launch one.
            </p>
          ) : (
            groups.map(({ agent, helpers }) => (
              <div key={agent.id} className="border-b-2 border-border last:border-b-0">
                <ActivityRowButton
                  row={agent}
                  focused={focusedAgentId === agent.id}
                  appearance={getAppearance(agent.id)}
                  status={statusFor(agent.id)}
                  tools={agentTools[agent.id]}
                  diag={diagnostics[agent.id]}
                  onOpenAgent={onOpenAgent}
                />
                {helpers.map((helper) => (
                  <ActivityRowButton
                    key={helper.id}
                    row={helper}
                    focused={focusedAgentId === helper.id}
                    appearance={getAppearance(helper.id)}
                    status={helper.kind === 'teammate' ? statusFor(helper.id) : null}
                    tools={helper.kind === 'teammate' ? agentTools[helper.id] : undefined}
                    onOpenAgent={onOpenAgent}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </aside>
  );
}

interface ActivityRowButtonProps {
  row: ActivityRow;
  focused: boolean;
  appearance: AgentAppearance;
  status: TabStatus | null;
  /** The agent's current turn, oldest first (cleared when the turn ends). */
  tools?: ToolActivity[];
  diag?: AgentDiagnostics;
  onOpenAgent: (agentId: number) => void;
}

/** One agent's row: mug shot, status dot, its name, the project it runs in,
 *  then what it is doing: its turn's newest tool calls, or a single line
 *  between turns. A sub-agent's name is its subtask; it shares its lead's
 *  project, so that line is left to the lead. */
function ActivityRowButton({
  row,
  focused,
  appearance,
  status,
  tools = [],
  diag,
  onOpenAgent,
}: ActivityRowButtonProps) {
  const isHelper = row.kind !== 'agent';
  const showProject = row.kind !== 'subagent';
  // Mid-turn the tool list says it all; a prompt waiting on the user is
  // spelled out above it too, and between turns the line stands alone.
  const shownTools = tools.slice(-AGENT_ACTIVITY_TOOL_LINES);
  const earlier = tools.length - shownTools.length;
  const showHeadline = tools.length === 0 || row.needsAttention;
  return (
    <button
      type="button"
      onClick={() => onOpenAgent(row.openId)}
      title={`${row.name} · ${row.project} — ${row.activity}`}
      data-testid="agent-activity-row"
      data-agent-id={row.id}
      className={`flex items-start gap-6 w-full py-4 pr-8 text-left border-0 cursor-pointer text-text ${
        isHelper ? 'pl-24' : 'pl-6'
      } ${focused ? 'bg-active-bg' : 'bg-transparent hover:bg-btn-hover'}`}
    >
      <CharacterMugShot
        palette={appearance.palette}
        repeat={appearance.repeat}
        zoom={isHelper ? 1 : undefined}
        cropTop={CARD_MUGSHOT_CROP_TOP_ROW}
      />
      <span className="flex flex-col gap-2 min-w-0 flex-1">
        <span className="flex items-center gap-4 min-w-0">
          <span className={`flex shrink-0 ${status ? STATUS_DOT[status] : 'invisible'}`}>
            <PixelIcon name="dot" scale={1} />
          </span>
          <span
            data-testid="agent-activity-name"
            className={`truncate leading-none ${row.kind === 'subagent' ? 'text-xs italic' : 'text-sm'}`}
            style={row.kind === 'teammate' ? { color: TEAM_ROLE_COLOR } : undefined}
          >
            {row.name}
          </span>
          {row.role && (
            <span className="shrink-0 text-2xs leading-none" style={{ color: TEAM_LEAD_COLOR }}>
              {row.role}
            </span>
          )}
        </span>
        {showProject && (
          <span
            data-testid="agent-activity-project"
            className="flex items-center gap-4 min-w-0 text-xs leading-none text-text-muted"
          >
            <PixelIcon name="folder" scale={1} />
            <span className="truncate">{row.project}</span>
          </span>
        )}
        {showHeadline && (
          <span
            className={`text-xs leading-tight wrap-break-word ${
              row.needsAttention ? 'text-status-permission' : 'text-text-muted'
            }`}
          >
            {row.activity}
          </span>
        )}
        {earlier > 0 && (
          <span className="text-2xs leading-none text-text-muted">+{earlier} earlier</span>
        )}
        {shownTools.map((tool) => (
          <ToolLine key={tool.toolId} tool={tool} compact />
        ))}
        {/* A fresh session has no transcript until its first prompt, so only
            "last data" is shown here; the Debug View has the full picture. */}
        {diag && diag.lastDataAt > 0 && (
          <span className="text-2xs leading-none text-text-muted">
            Last data {formatTimeAgo(diag.lastDataAt)}
          </span>
        )}
      </span>
    </button>
  );
}

function storedShut(): boolean {
  try {
    return localStorage.getItem(AGENT_ACTIVITY_SIDEBAR_SHUT_KEY) === '1';
  } catch {
    return false;
  }
}

function storeShut(shut: boolean): void {
  try {
    if (shut) localStorage.setItem(AGENT_ACTIVITY_SIDEBAR_SHUT_KEY, '1');
    else localStorage.removeItem(AGENT_ACTIVITY_SIDEBAR_SHUT_KEY);
  } catch {
    // Not remembered; it still folds and unfolds.
  }
}

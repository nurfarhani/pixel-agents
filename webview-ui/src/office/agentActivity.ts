import type { SubagentCharacter, ToolActivity } from './types.js';

// What an agent is doing, in words: the label over its character (ToolOverlay)
// and the desktop activity sidebar (AgentActivitySidebar) read it from here,
// so both always say the same thing. DOM-free.

// Both turn-end states show the green checkmark bubble. A finished turn (Stop)
// shows ONLY the checkmark (the label falls through to its normal idle text);
// going idle waiting on the user (Notification(idle_prompt)) additionally
// surfaces this label. Driven by Character.waitingAwaitingInput.
export const WAITING_INPUT_ACTIVITY_TEXT = 'Waiting for input';
const NEEDS_APPROVAL_ACTIVITY_TEXT = 'Needs approval';
const IDLE_ACTIVITY_TEXT = 'Idle';
/** A sub-agent between tool calls: its subtask is still running. */
const SUBAGENT_WORKING_TEXT = 'Working';
/** An agent with no name and no named character yet (the cast still loading): "Agent 3". */
const AGENT_NAME_FALLBACK = 'Agent';
const SUBAGENT_NAME_FALLBACK = 'Subtask';
/** No Directory name reached the webview for this agent (e.g. single-root VS Code). */
export const UNKNOWN_PROJECT_TEXT = 'Unknown project';

/** A moment as a 24-hour local clock time, "14:05:09": the time a tool call
 *  started, drawn in the pixel number font. */
export function clockTime(ms: number, date: Date = new Date(ms)): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}

/** Derive a short human-readable activity string from tools/status */
export function getActivityText(
  agentId: number,
  agentTools: Record<number, ToolActivity[]>,
  isActive: boolean,
  bubbleType: 'permission' | 'waiting' | null,
  waitingAwaitingInput: boolean,
): string {
  if (bubbleType === 'permission') return NEEDS_APPROVAL_ACTIVITY_TEXT;
  // Only the idle case ("Waiting for input") gets a dedicated label. A finished
  // turn (Stop, waitingAwaitingInput=false) falls through so the checkmark alone
  // signals "done", same as the original behavior.
  if (bubbleType === 'waiting' && waitingAwaitingInput) return WAITING_INPUT_ACTIVITY_TEXT;

  const tools = agentTools[agentId];
  if (tools && tools.length > 0) {
    // Find the latest non-done tool
    const activeTool = [...tools].reverse().find((t) => !t.done);
    if (activeTool) {
      if (activeTool.permissionWait) return NEEDS_APPROVAL_ACTIVITY_TEXT;
      return activeTool.status;
    }
    // All tools done but agent still active (mid-turn) — keep showing last tool status
    if (isActive) {
      const lastTool = tools[tools.length - 1];
      if (lastTool) return lastTool.status;
    }
  }

  return IDLE_ACTIVITY_TEXT;
}

/** What the activity sidebar reads off a character (a structural slice of
 *  office/types.ts Character, so tests need not build whole characters). */
export interface ActivityCharacter {
  isActive: boolean;
  bubbleType: 'permission' | 'waiting' | null;
  waitingAwaitingInput?: boolean;
  directoryName?: string;
  agentName?: string;
  isTeamLead?: boolean;
  leadAgentId?: number;
  /** The character it wears (a profile index): names a main agent. */
  palette?: number;
}

export interface ActivityRow {
  /** The character's id (negative for sub-agents). */
  id: number;
  /** The agent whose terminal a press on this row should reach. */
  openId: number;
  kind: 'agent' | 'teammate' | 'subagent';
  /** Who it is: a teammate's own name, else the character it wears; a
   *  sub-agent's subtask title. */
  name: string;
  /** The Directory the agent runs in. */
  project: string;
  /** 'LEAD' for a team lead, else null. */
  role: 'LEAD' | null;
  activity: string;
  /** Waiting on the user: a permission prompt or an idle prompt. */
  needsAttention: boolean;
}

/** One main agent (a card) and everything working for it. */
export interface AgentActivityGroup {
  agent: ActivityRow;
  helpers: ActivityRow[];
}

export interface AgentActivityInput {
  /** Main agents, in the card bar's order. */
  cardAgents: readonly number[];
  /** Every agent, teammates included. */
  agents: readonly number[];
  characters: ReadonlyMap<number, ActivityCharacter>;
  agentTools: Record<number, ToolActivity[]>;
  subagentTools: Record<number, Record<string, ToolActivity[]>>;
  subagentCharacters: readonly SubagentCharacter[];
  /** Each agent's Claude project dir (from the Debug View's diagnostics): the
   *  project name when no Directory name reached the webview. */
  projectDirs?: Readonly<Record<number, string>>;
  /** A character's name by palette (the cast's), for agents without a name of their own. */
  characterName?: (palette: number) => string | undefined;
}

/**
 * The sidebar's rows: one group per main agent in card order, its teammates
 * and sub-agents (its own and its teammates') listed under it. A teammate
 * whose lead is gone gets a group of its own at the end, so nobody at work
 * is left off the list.
 */
export function buildAgentActivity(input: AgentActivityInput): AgentActivityGroup[] {
  const { cardAgents, agents, characters } = input;
  const placed = new Set<number>();
  const groups: AgentActivityGroup[] = [];

  const addGroup = (id: number) => {
    const ch = characters.get(id);
    if (!ch || placed.has(id)) return;
    placed.add(id);
    const agent = agentRow(id, id, ch, 'agent', input);
    const teammates = agents.filter(
      (other) => other !== id && !placed.has(other) && characters.get(other)?.leadAgentId === id,
    );
    const helpers: ActivityRow[] = [];
    for (const teammateId of teammates) {
      const teammate = characters.get(teammateId);
      if (!teammate) continue;
      placed.add(teammateId);
      helpers.push(agentRow(teammateId, id, teammate, 'teammate', input, ch.directoryName));
    }
    const owners = new Set([id, ...teammates]);
    for (const sub of input.subagentCharacters) {
      if (owners.has(sub.parentAgentId)) helpers.push(subagentRow(sub, id, agent.project, input));
    }
    groups.push({ agent, helpers });
  };

  for (const id of cardAgents) addGroup(id);
  // Teammates whose lead left the office (or any agent the card order missed).
  for (const id of agents) addGroup(id);
  return groups;
}

function agentRow(
  id: number,
  openId: number,
  ch: ActivityCharacter,
  kind: 'agent' | 'teammate',
  input: AgentActivityInput,
  fallbackProject?: string,
): ActivityRow {
  const tools = input.agentTools[id];
  const permission =
    ch.bubbleType === 'permission' || (tools?.some((t) => t.permissionWait && !t.done) ?? false);
  const awaitingInput = ch.bubbleType === 'waiting' && (ch.waitingAwaitingInput ?? false);
  return {
    id,
    openId,
    kind,
    name:
      ch.agentName ??
      (ch.palette !== undefined ? input.characterName?.(ch.palette) : undefined) ??
      `${AGENT_NAME_FALLBACK} ${id}`,
    project:
      ch.directoryName ??
      projectNameFromProjectDir(input.projectDirs?.[id]) ??
      fallbackProject ??
      UNKNOWN_PROJECT_TEXT,
    role: ch.isTeamLead ? 'LEAD' : null,
    activity: getActivityText(
      id,
      input.agentTools,
      ch.isActive,
      ch.bubbleType,
      ch.waitingAwaitingInput ?? false,
    ),
    needsAttention: permission || awaitingInput,
  };
}

function subagentRow(
  sub: SubagentCharacter,
  openId: number,
  project: string,
  input: AgentActivityInput,
): ActivityRow {
  const ch = input.characters.get(sub.id);
  const rows = input.subagentTools[sub.parentAgentId]?.[sub.parentToolId];
  const activeRow = rows ? [...rows].reverse().find((t) => !t.done) : undefined;
  const permission = ch?.bubbleType === 'permission' || (activeRow?.permissionWait ?? false);
  return {
    id: sub.id,
    openId,
    kind: 'subagent',
    name: sub.label || SUBAGENT_NAME_FALLBACK,
    project,
    role: null,
    activity: permission
      ? NEEDS_APPROVAL_ACTIVITY_TEXT
      : (activeRow?.status ?? SUBAGENT_WORKING_TEXT),
    needsAttention: permission,
  };
}

/**
 * A readable project name from a Claude project dir, the way the server names
 * external sessions (fileWatcher's directoryNameFromProjectDir): Claude files
 * `D:\src\ScanBarcode`'s sessions under `D--src-ScanBarcode`, so the last
 * dash-separated part. A name with its own dashes keeps only its tail.
 */
export function projectNameFromProjectDir(projectDir: string | undefined): string | undefined {
  if (!projectDir) return undefined;
  const dirName = projectDir.split(/[\\/]/).filter(Boolean).pop();
  if (!dirName) return undefined;
  const parts = dirName.replace(/^-+/, '').split('-');
  return parts[parts.length - 1] || dirName;
}

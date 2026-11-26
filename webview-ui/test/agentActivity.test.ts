import { describe, expect, it } from 'vitest';

import {
  type ActivityCharacter,
  buildAgentActivity,
  clockTime,
  getActivityText,
  projectNameFromProjectDir,
  UNKNOWN_PROJECT_TEXT,
  WAITING_INPUT_ACTIVITY_TEXT,
} from '../src/office/agentActivity.js';
import type { ToolActivity } from '../src/office/types.js';

function ch(overrides: Partial<ActivityCharacter> = {}): ActivityCharacter {
  return { isActive: false, bubbleType: null, ...overrides };
}

function tool(status: string, overrides: Partial<ToolActivity> = {}): ToolActivity {
  return { toolId: status, status, done: false, ...overrides };
}

const empty = {
  agentTools: {},
  subagentTools: {},
  subagentCharacters: [],
};

describe('getActivityText', () => {
  it('shows the newest running tool', () => {
    const tools = { 1: [tool('Reading a.ts', { done: true }), tool('Editing b.ts')] };
    expect(getActivityText(1, tools, true, null, false)).toBe('Editing b.ts');
  });

  it('keeps the last tool mid-turn, idles after', () => {
    const tools = { 1: [tool('Running: npm test', { done: true })] };
    expect(getActivityText(1, tools, true, null, false)).toBe('Running: npm test');
    expect(getActivityText(1, tools, false, null, false)).toBe('Idle');
  });

  it('puts prompts first', () => {
    expect(getActivityText(1, {}, true, 'permission', false)).toBe('Needs approval');
    expect(getActivityText(1, {}, false, 'waiting', true)).toBe(WAITING_INPUT_ACTIVITY_TEXT);
    const waiting = { 1: [tool('Bash', { permissionWait: true })] };
    expect(getActivityText(1, waiting, true, null, false)).toBe('Needs approval');
  });
});

describe('buildAgentActivity', () => {
  it('one group per card, in card order, with each project', () => {
    const groups = buildAgentActivity({
      ...empty,
      cardAgents: [2, 1],
      agents: [1, 2],
      characters: new Map([
        [1, ch({ directoryName: 'ScanBarcode' })],
        [2, ch({ directoryName: 'AeroNode', isActive: true })],
      ]),
      agentTools: { 2: [tool('Editing ASNsPage.tsx')] },
    });
    expect(groups.map((g) => [g.agent.id, g.agent.project, g.agent.activity])).toEqual([
      [2, 'AeroNode', 'Editing ASNsPage.tsx'],
      [1, 'ScanBarcode', 'Idle'],
    ]);
  });

  it('names the project unknown when no Directory reached the webview', () => {
    const [group] = buildAgentActivity({
      ...empty,
      cardAgents: [1],
      agents: [1],
      characters: new Map([[1, ch()]]),
    });
    expect(group?.agent.project).toBe(UNKNOWN_PROJECT_TEXT);
  });

  it("names the project from the Debug View's project dir when no Directory name came", () => {
    const groups = buildAgentActivity({
      ...empty,
      cardAgents: [1, 2],
      agents: [1, 2],
      characters: new Map([
        [1, ch()],
        [2, ch({ directoryName: 'Named' })],
      ]),
      projectDirs: {
        1: 'C:\\Users\\me\\.claude\\projects\\D--nurfarhani-source-Workspaces-ScanBarcode',
        2: '/home/me/.claude/projects/-home-me-other',
      },
    });
    expect(groups.map((g) => g.agent.project)).toEqual(['ScanBarcode', 'Named']);
  });

  it('lists teammates and sub-agents under their lead', () => {
    const groups = buildAgentActivity({
      cardAgents: [1],
      agents: [1, 5],
      characters: new Map([
        [1, ch({ directoryName: 'WMS', isTeamLead: true })],
        [5, ch({ agentName: 'tester', leadAgentId: 1 })],
        [-1, ch()],
      ]),
      agentTools: {},
      subagentTools: { 1: { toolA: [tool('Grep: TODO')] } },
      subagentCharacters: [
        { id: -1, parentAgentId: 1, parentToolId: 'toolA', label: 'Subtask: scan' },
      ],
    });
    expect(groups).toHaveLength(1);
    const [group] = groups;
    expect(group?.agent.role).toBe('LEAD');
    expect(group?.helpers.map((h) => [h.kind, h.name, h.project, h.activity, h.openId])).toEqual([
      ['teammate', 'tester', 'WMS', 'Idle', 1],
      ['subagent', 'Subtask: scan', 'WMS', 'Grep: TODO', 1],
    ]);
  });

  it('names a main agent after its character, a teammate by its own name', () => {
    const names = ['Suit', 'Dress', 'Spike', 'Aura'];
    const groups = buildAgentActivity({
      ...empty,
      cardAgents: [1, 2],
      agents: [1, 2, 5],
      characters: new Map([
        [1, ch({ palette: 3, directoryName: 'ScanBarcode' })],
        [2, ch({ palette: 9 })],
        [5, ch({ palette: 3, agentName: 'tester', leadAgentId: 1 })],
      ]),
      characterName: (palette) => names[palette],
    });
    expect(groups.map((g) => [g.agent.name, g.agent.project])).toEqual([
      ['Aura', 'ScanBarcode'],
      ['Agent 2', UNKNOWN_PROJECT_TEXT],
    ]);
    expect(groups[0]?.helpers.map((h) => h.name)).toEqual(['tester']);
  });

  it('gives a teammate whose lead left its own group', () => {
    const groups = buildAgentActivity({
      ...empty,
      cardAgents: [],
      agents: [5],
      characters: new Map([[5, ch({ agentName: 'tester', leadAgentId: 1 })]]),
    });
    expect(groups.map((g) => g.agent.id)).toEqual([5]);
  });

  it('flags prompts that wait on the user', () => {
    const groups = buildAgentActivity({
      ...empty,
      cardAgents: [1, 2, 3],
      agents: [1, 2, 3],
      characters: new Map([
        [1, ch({ bubbleType: 'permission' })],
        [2, ch({ bubbleType: 'waiting', waitingAwaitingInput: true })],
        [3, ch({ bubbleType: 'waiting' })],
      ]),
    });
    expect(groups.map((g) => g.agent.needsAttention)).toEqual([true, true, false]);
  });
});

describe('projectNameFromProjectDir', () => {
  it('takes the last part of the dir Claude files the sessions under', () => {
    expect(projectNameFromProjectDir('/home/me/.claude/projects/-home-me-src-WMS')).toBe('WMS');
    expect(projectNameFromProjectDir('C:\\x\\projects\\D--src-ScanBarcode')).toBe('ScanBarcode');
    expect(projectNameFromProjectDir(undefined)).toBeUndefined();
    expect(projectNameFromProjectDir('')).toBeUndefined();
  });
});

describe('clockTime', () => {
  it('writes a 24-hour local time with seconds, zero-padded', () => {
    expect(clockTime(0, new Date(2026, 10, 26, 9, 5, 7))).toBe('09:05:07');
    expect(clockTime(0, new Date(2026, 10, 26, 23, 59, 0))).toBe('23:59:00');
  });
});

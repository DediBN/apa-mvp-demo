import { useCallback, useEffect, useReducer } from 'react';
import ConsolePanel from './components/ConsolePanel';
import GatewayPanel from './components/GatewayPanel';
import { SCENARIOS, DEFAULT_SCENARIO } from './scenarios';
import type { Scenario, ScenarioKey } from './scenarios';
import './App.css';

// ── Phase + Mode ──────────────────────────────────────────────────────────────

export type Phase = 'idle' | 'typing' | 'ready' | 'analyzing' | 'running' | 'done';
export type Mode  = 'scripted' | 'live';

// ── API types ─────────────────────────────────────────────────────────────────

interface AnalyzeEntity { value: string; type: string; token: string; }
interface AnalyzeTask {
  id: number;
  title: string;
  destination: 'local' | 'cloud';
  model: string;
  needsCloud: boolean;
  cloudPrompt?: string;
}
interface AnalyzeResult { entities: AnalyzeEntity[]; tasks: AnalyzeTask[]; }

export interface ExecuteTaskResult {
  id: number;
  response: string | null;
  error: string | null;
}

// ── Build Scenario from API response ─────────────────────────────────────────

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildLiveScenario(prompt: string, result: AnalyzeResult): Scenario {
  let masked = prompt;
  for (const e of [...result.entities].sort((a, b) => b.value.length - a.value.length)) {
    masked = masked.replace(new RegExp(escapeRegex(e.value), 'g'), e.token);
  }

  const localCount = result.tasks.filter(t => !t.needsCloud).length;
  const cloudCount = result.tasks.filter(t => t.needsCloud).length;
  const now = new Date().toTimeString().slice(0, 8);

  return {
    key: 'wealth' as ScenarioKey,
    icon: '⚡',
    cardLabel: 'Live',
    cardDesc: 'Your prompt',
    workspace: 'Live Analysis',
    user: 'You',
    request: prompt,
    piiMap: result.entities.map(e => ({ value: e.value, token: e.token })),
    tasks: result.tasks.map(t => ({
      id: t.id,
      label: t.title,
      destination: t.destination,
      model: t.model || (t.destination === 'cloud' ? 'Claude' : 'Llama 3.2'),
      anonymized: t.needsCloud,
      executionMs: t.destination === 'cloud' ? 3500 : 900,
      cloudPrompt: t.cloudPrompt,   // preserved for apa-execute
    })),
    maskedPrompt: masked,
    finalAnswer: {
      title: 'Live Analysis Complete',
      body:
        `${result.entities.length} entities detected and masked. ` +
        `${localCount} task${localCount !== 1 ? 's' : ''} ran locally, ` +
        `${cloudCount} sent to cloud (masked).`,
    },
    answerChips: [
      `🔒 ${result.entities.length} entities masked`,
      `🖥 ${localCount} local`,
      `☁ ${cloudCount} masked`,
    ],
    auditRows: result.tasks
      .filter(t => t.needsCloud)
      .map(t => ({
        time: now,
        task: t.title,
        sentTo: t.model || 'Claude',
        blocked: result.entities.map(e => e.token.replace(/[\[\]]/g, '')),
        status: 'Clean' as const,
      })),
    banner: `${result.entities.length} entities masked. Zero PII reached the cloud.`,
  };
}

// ── State machine ─────────────────────────────────────────────────────────────

interface State {
  mode: Mode;
  scenario: ScenarioKey | null;
  livePrompt: string;
  liveScenario: Scenario | null;
  analyzeError: string | null;
  executeResults: ExecuteTaskResult[] | null;
  executeError: string | null;
  phase: Phase;
}

type Action =
  | { type: 'SELECT_SCENARIO'; key: ScenarioKey }
  | { type: 'SELECT_LIVE' }
  | { type: 'SET_LIVE_PROMPT'; text: string }
  | { type: 'TYPING_DONE' }
  | { type: 'SEND' }
  | { type: 'ANALYZE_SUCCESS'; scenario: Scenario }
  | { type: 'ANALYZE_ERROR'; message: string }
  | { type: 'EXECUTE_SUCCESS'; results: ExecuteTaskResult[] }
  | { type: 'EXECUTE_ERROR'; message: string }
  | { type: 'RUN_COMPLETE' }
  | { type: 'REPLAY_LIVE' }
  | { type: 'RESET' };

const INITIAL: State = {
  mode: 'scripted',
  scenario: DEFAULT_SCENARIO,
  livePrompt: '',
  liveScenario: null,
  analyzeError: null,
  executeResults: null,
  executeError: null,
  phase: 'typing',
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SELECT_SCENARIO': {
      const replay =
        state.mode === 'scripted' &&
        state.scenario === action.key &&
        state.phase === 'done';
      return {
        mode: 'scripted',
        scenario: action.key,
        livePrompt: '',
        liveScenario: null,
        analyzeError: null,
        executeResults: null,
        executeError: null,
        phase: replay ? 'ready' : 'typing',
      };
    }

    case 'SELECT_LIVE':
      return {
        mode: 'live',
        scenario: null,
        livePrompt: '',
        liveScenario: null,
        analyzeError: null,
        executeResults: null,
        executeError: null,
        phase: 'typing',
      };

    case 'SET_LIVE_PROMPT':
      return { ...state, livePrompt: action.text, analyzeError: null };

    case 'TYPING_DONE':
      return state.mode === 'scripted' && state.phase === 'typing'
        ? { ...state, phase: 'ready' }
        : state;

    case 'SEND':
      if (state.mode === 'live') {
        return state.livePrompt.trim() ? { ...state, phase: 'analyzing' } : state;
      }
      return state.phase === 'ready' ? { ...state, phase: 'running' } : state;

    case 'ANALYZE_SUCCESS':
      return {
        ...state,
        phase: 'running',
        liveScenario: action.scenario,
        executeResults: null,
        executeError: null,
      };

    case 'ANALYZE_ERROR':
      return { ...state, phase: 'typing', analyzeError: action.message };

    case 'EXECUTE_SUCCESS':
      return { ...state, executeResults: action.results };

    case 'EXECUTE_ERROR':
      return { ...state, executeError: action.message };

    case 'RUN_COMPLETE':
      return state.phase === 'running' ? { ...state, phase: 'done' } : state;

    case 'REPLAY_LIVE':
      return state.mode === 'live'
        ? { ...state, phase: 'typing', liveScenario: null, analyzeError: null, executeResults: null, executeError: null }
        : state;

    case 'RESET':
      return { ...INITIAL };

    default:
      return state;
  }
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const {
    mode, scenario: scenarioKey, phase,
    livePrompt, liveScenario, analyzeError,
    executeResults, executeError,
  } = state;

  const scriptedScenario = scenarioKey ? SCENARIOS[scenarioKey] : null;
  const activeScenario: Scenario | null =
    mode === 'live' ? liveScenario : scriptedScenario;

  // ── apa-analyze: fire when phase enters 'analyzing' ───────────────────────
  useEffect(() => {
    if (phase !== 'analyzing') return;
    let cancelled = false;

    fetch('/.netlify/functions/apa-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: livePrompt }),
    })
      .then(async res => {
        if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
        return res.json() as Promise<AnalyzeResult>;
      })
      .then(result => {
        if (!cancelled)
          dispatch({ type: 'ANALYZE_SUCCESS', scenario: buildLiveScenario(livePrompt, result) });
      })
      .catch(err => {
        if (!cancelled)
          dispatch({ type: 'ANALYZE_ERROR', message: err instanceof Error ? err.message : String(err) });
      });

    return () => { cancelled = true; };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── apa-execute: fire when phase enters 'running' in live mode ───────────
  // Runs in the background while the visual pipeline animates (~15 s).
  // Results are almost always ready by the time phase reaches 'done'.
  useEffect(() => {
    if (phase !== 'running' || mode !== 'live' || !liveScenario) return;

    const cloudTasks = liveScenario.tasks
      .filter(t => t.destination === 'cloud' && t.cloudPrompt)
      .map(t => ({ id: t.id, cloudPrompt: t.cloudPrompt! }));

    if (cloudTasks.length === 0) {
      dispatch({ type: 'EXECUTE_SUCCESS', results: [] });
      return;
    }

    let cancelled = false;

    fetch('/.netlify/functions/apa-execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks: cloudTasks }),
    })
      .then(async res => {
        if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
        return res.json() as Promise<{ results: ExecuteTaskResult[] }>;
      })
      .then(data => {
        if (!cancelled)
          dispatch({ type: 'EXECUTE_SUCCESS', results: data.results });
      })
      .catch(err => {
        if (!cancelled)
          dispatch({ type: 'EXECUTE_ERROR', message: err instanceof Error ? err.message : String(err) });
      });

    return () => { cancelled = true; };
  }, [phase, mode, liveScenario]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  const handleKey = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (e.key === 'r' || e.key === 'R') dispatch({ type: 'RESET' });
    if ((e.key === ' ' || e.key === 'Enter') && phase === 'ready') {
      e.preventDefault();
      dispatch({ type: 'SEND' });
    }
    if (e.key === ' ' && phase === 'done') {
      e.preventDefault();
      dispatch({ type: 'RESET' });
    }
  }, [phase]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  return (
    <div className="demo-shell">
      <ConsolePanel
        mode={mode}
        scenario={activeScenario}
        phase={phase}
        livePrompt={livePrompt}
        analyzeError={analyzeError}
        executeResults={executeResults}
        executeError={executeError}
        onSelectScenario={key => dispatch({ type: 'SELECT_SCENARIO', key })}
        onSelectLive={() => dispatch({ type: 'SELECT_LIVE' })}
        onLivePromptChange={text => dispatch({ type: 'SET_LIVE_PROMPT', text })}
        onTypingDone={() => dispatch({ type: 'TYPING_DONE' })}
        onSend={() => dispatch({ type: 'SEND' })}
        onReplayLive={() => dispatch({ type: 'REPLAY_LIVE' })}
        onReset={() => dispatch({ type: 'RESET' })}
      />
      <GatewayPanel
        scenario={activeScenario}
        phase={phase}
        onRunComplete={() => dispatch({ type: 'RUN_COMPLETE' })}
      />
    </div>
  );
}

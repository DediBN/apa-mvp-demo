import { useCallback, useEffect, useRef, useState } from 'react';
import type { Scenario } from '../scenarios';
import type { Phase } from '../App';
import StageIntercept from '../stages/StageIntercept';
import StageMask      from '../stages/StageMask';
import StageStub      from '../stages/StageStub';
import type { StageProps } from '../stages/types';
import './GatewayPanel.css';

// ── Event log types ───────────────────────────────────────────────────────────

type EventType =
  | 'INTERCEPT' | 'PII_DETECTED' | 'TASK_ROUTED' | 'MASK_APPLIED'
  | 'CLOUD_REQUEST' | 'CLOUD_RESPONSE' | 'RECONSTRUCTED' | 'AUDIT';

interface LogEvent {
  id: string;
  ts: string;
  type: EventType;
  detail: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(d: Date): string {
  return (
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0') + ':' +
    String(d.getSeconds()).padStart(2, '0') + '.' +
    String(d.getMilliseconds()).padStart(3, '0')
  );
}

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// ── Stage registry ────────────────────────────────────────────────────────────

interface StageConfig {
  id: string;
  label: string;
  icon: string;
  desc: string;
  render: (props: StageProps) => React.ReactNode;
}

const GATEWAY_STAGES: StageConfig[] = [
  {
    id: 'INTERCEPT', label: 'Intercept', icon: '🔍',
    desc: 'Request intercepted at gateway · PII detection',
    render: p => <StageIntercept {...p} />,
  },
  {
    id: 'DECOMPOSE', label: 'Decompose', icon: '🧩',
    desc: 'Local orchestrator · task decomposition',
    render: p => {
      const tasks  = p.scenario?.tasks ?? [];
      const local  = tasks.filter(t => t.destination === 'local').length;
      const cloud  = tasks.filter(t => t.destination === 'cloud').length;
      const note   = tasks.length > 0
        ? `${tasks.length} tasks identified · ${local} local, ${cloud} cloud`
        : '5 tasks identified · 3 local, 2 cloud';
      return <StageStub {...p} durationMs={2500} doneNote={note} />;
    },
  },
  {
    id: 'ROUTE', label: 'Route', icon: '🔀',
    desc: 'Model assignment · local vs cloud',
    render: p => {
      const tasks = p.scenario?.tasks ?? [];
      let note = 'Llama 3.2, Qwen 2.5 local · Claude, GPT-4o cloud (masked)';
      if (tasks.length > 0) {
        const lm = [...new Set(tasks.filter(t => t.destination === 'local').map(t => t.model))].join(', ');
        const cm = [...new Set(tasks.filter(t => t.destination === 'cloud').map(t => t.model))].join(', ');
        note = `${lm || '—'} local · ${cm || '—'} cloud (masked)`;
      }
      return <StageStub {...p} durationMs={2000} doneNote={note} />;
    },
  },
  {
    id: 'MASK', label: 'Mask', icon: '🔒',
    desc: 'PII masking + on-premises vault encryption',
    render: p => <StageMask {...p} />,
  },
  {
    id: 'EXECUTE', label: 'Execute', icon: '⚡',
    desc: 'Parallel task execution · 3 local + 2 cloud',
    render: p => {
      const tasks  = p.scenario?.tasks ?? [];
      const local  = tasks.filter(t => t.destination === 'local').length;
      const cloud  = tasks.filter(t => t.destination === 'cloud').length;
      const note   = tasks.length > 0
        ? `All ${tasks.length} tasks complete · ${local} local, ${cloud} cloud`
        : 'All 5 tasks complete · local avg 900ms · cloud avg 4s';
      return <StageStub {...p} durationMs={3500} doneNote={note} />;
    },
  },
  {
    id: 'ASSEMBLE', label: 'Assemble', icon: '📄',
    desc: 'On-premises reconstruction · token replacement',
    render: p => <StageStub {...p} durationMs={2000} doneNote="Response assembled · 0 plaintext exposures" />,
  },
  {
    id: 'AUDIT', label: 'Audit', icon: '📋',
    desc: 'Audit trail generation · compliance log',
    render: p => {
      const rows = p.scenario?.auditRows ?? [];
      const note = rows.length > 0
        ? `${rows.length} outbound call${rows.length !== 1 ? 's' : ''} logged · all entities accounted`
        : '2 outbound calls logged · all entities accounted';
      return <StageStub {...p} durationMs={1800} doneNote={note} />;
    },
  },
];

// ── EventLogViewer ────────────────────────────────────────────────────────────

function EventLogViewer({ events }: { events: LogEvent[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events.length]);

  if (events.length === 0) {
    return (
      <div className="elog-empty">
        <span className="elog-empty__icon">▸</span>
        <span>Awaiting pipeline events…</span>
      </div>
    );
  }

  return (
    <div className="elog-viewer">
      {events.map(e => (
        <div key={e.id} className="elog-entry">
          <span className="elog-ts">{e.ts}</span>
          <span className={`elog-badge elog-badge--${e.type.toLowerCase().replace(/_/g, '-')}`}>
            {e.type}
          </span>
          <span className="elog-detail">{e.detail}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

// ── GatewayPanel ──────────────────────────────────────────────────────────────

interface Props {
  scenario: Scenario | null;
  phase: Phase;
  onRunComplete: () => void;
}

export default function GatewayPanel({ scenario, phase, onRunComplete }: Props) {
  const [currentStage,    setCurrentStage]    = useState(-1);
  const [completedStages, setCompletedStages] = useState<Set<number>>(new Set());
  const [eventLog,        setEventLog]        = useState<LogEvent[]>([]);
  const [showLog,         setShowLog]         = useState(false);

  const stageRefs     = useRef<(HTMLDivElement | null)[]>([]);
  const cbRef         = useRef(onRunComplete);
  cbRef.current       = onRunComplete;
  const scenarioRef   = useRef(scenario);
  scenarioRef.current = scenario;
  const timerIds      = useRef<ReturnType<typeof setTimeout>[]>([]);

  const cancelTimers = useCallback(() => {
    timerIds.current.forEach(clearTimeout);
    timerIds.current = [];
  }, []);

  const queueEvent = useCallback((delay: number, type: EventType, detail: string, stageId: string) => {
    const tid = setTimeout(() => {
      setEventLog(prev => [...prev, {
        id: `${stageId}-${type}-${delay}-${Math.random().toString(36).slice(2, 7)}`,
        ts: fmtTime(new Date()),
        type,
        detail,
      }]);
    }, delay);
    timerIds.current.push(tid);
  }, []);

  const scheduleStageEvents = useCallback((stageId: string) => {
    const s = scenarioRef.current;
    const q = (delay: number, type: EventType, detail: string) =>
      queueEvent(delay, type, detail, stageId);

    switch (stageId) {
      case 'INTERCEPT': {
        q(60,  'INTERCEPT',    'Request intercepted · deep packet inspection active');
        const pii = s?.piiMap ?? [];
        if (s?.attachedTable) {
          q(220, 'PII_DETECTED', `Table scan: ${pii.length} PII entities across ${s.attachedTable.rows.length} records`);
          s.attachedTable.piiCols.forEach((col, i) =>
            q(420 + i * 180, 'PII_DETECTED',
              `Column "${s!.attachedTable!.headers[col]}": ${s!.attachedTable!.rows.length} values flagged`)
          );
        } else {
          pii.forEach((e, i) =>
            q(220 + i * 280, 'PII_DETECTED', `${e.token} ← "${trunc(e.value, 28)}"`)
          );
        }
        break;
      }
      case 'DECOMPOSE': {
        const tasks = s?.tasks ?? [];
        q(60, 'TASK_ROUTED', `Orchestrator decomposing into ${tasks.length} sub-tasks`);
        tasks.forEach((t, i) =>
          q(360 + i * 260, 'TASK_ROUTED', `Task ${t.id}: ${trunc(t.label, 38)} [${t.destination}]`)
        );
        break;
      }
      case 'ROUTE': {
        (s?.tasks ?? []).forEach((t, i) =>
          q(100 + i * 220, 'TASK_ROUTED',
            `Task ${t.id} → ${t.model} · ${t.destination === 'cloud' ? '☁ cloud (masked)' : '🖥 local'}`)
        );
        break;
      }
      case 'MASK': {
        const pii      = s?.piiMap ?? [];
        const interval = s?.attachedTable ? 120 : 300;
        pii.forEach((e, i) =>
          q(i * interval, 'MASK_APPLIED', `${e.token} ← "${trunc(e.value, 24)}" → vault`)
        );
        break;
      }
      case 'EXECUTE': {
        const cloud = (s?.tasks ?? []).filter(t => t.destination === 'cloud');
        cloud.forEach((t, i) => {
          q(80  + i * 120,  'CLOUD_REQUEST',  `→ ${t.model}: Task ${t.id} dispatched (payload masked)`);
          q(2300 + i * 350, 'CLOUD_RESPONSE', `← ${t.model}: Task ${t.id} response received`);
        });
        break;
      }
      case 'ASSEMBLE': {
        q(60,  'RECONSTRUCTED', `Re-inserting ${s?.piiMap.length ?? 0} values from on-premises vault`);
        q(500, 'RECONSTRUCTED', 'Final response assembled · zero PII exposed to cloud');
        break;
      }
      case 'AUDIT': {
        q(60, 'AUDIT', `Audit trail sealed · ${s?.auditRows.length ?? 0} outbound calls logged`);
        (s?.auditRows ?? []).forEach((row, i) =>
          q(300 + i * 280, 'AUDIT',
            `${trunc(row.task, 34)} → ${row.sentTo} · ${row.blocked.length} entities blocked`)
        );
        break;
      }
    }
  }, [queueEvent]);

  // Phase transitions
  useEffect(() => {
    if (phase === 'running') {
      cancelTimers();
      setCurrentStage(0);
      setCompletedStages(new Set());
      setEventLog([]);
      setShowLog(false);
      setTimeout(() => stageRefs.current[0]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
    } else if (phase !== 'done') {
      cancelTimers();
      setCurrentStage(-1);
      setCompletedStages(new Set());
      setEventLog([]);
    }
  }, [phase, cancelTimers]);

  // Emit events whenever a stage becomes active
  useEffect(() => {
    if (currentStage < 0) return;
    scheduleStageEvents(GATEWAY_STAGES[currentStage].id);
  }, [currentStage, scheduleStageEvents]);

  const handleStageComplete = useCallback((idx: number) => {
    setCompletedStages(prev => { const n = new Set(prev); n.add(idx); return n; });
    const next = idx + 1;
    if (next < GATEWAY_STAGES.length) {
      setCurrentStage(next);
      setTimeout(() => {
        stageRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 80);
    } else {
      setTimeout(() => cbRef.current(), 600);
    }
  }, []);

  // Toggle log view; scroll pipeline back to active stage when closing log
  const toggleLog = useCallback(() => {
    setShowLog(prev => {
      const next = !prev;
      if (!next && currentStage >= 0) {
        setTimeout(() => {
          stageRefs.current[currentStage]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 60);
      }
      return next;
    });
  }, [currentStage]);

  const stageState = (idx: number) =>
    completedStages.has(idx) ? 'done' :
    idx === currentStage      ? 'active' : 'pending';

  const isIdle = phase === 'idle' || phase === 'typing' || phase === 'ready' || phase === 'analyzing';

  return (
    <div className="gateway-panel">

      {/* ── Header ── */}
      <header className="gateway-header">
        <div className="gateway-header__left">
          <span className={`gateway-pulse${phase === 'running' || phase === 'analyzing' ? ' gateway-pulse--live' : ''}`} />
          <span className="gateway-header__title">Zero-Trust Gateway</span>
          <span className="gateway-header__tag">LIVE</span>
        </div>
        <div className="gateway-header__right">
          {scenario && (
            <>
              <span className="gateway-header__scenario">{scenario.icon} {scenario.cardLabel}</span>
              <span className="gateway-header__user">{scenario.user}</span>
            </>
          )}
          <button
            className={`gateway-log-toggle${showLog ? ' gateway-log-toggle--active' : ''}`}
            onClick={toggleLog}
            title={showLog ? 'Show pipeline view' : 'Show event log'}
          >
            <span className="gateway-log-toggle__icon">☰</span>
            <span>{showLog ? 'Pipeline' : 'Event Log'}</span>
            {!showLog && eventLog.length > 0 && (
              <span className="gateway-log-toggle__count">{eventLog.length}</span>
            )}
          </button>
        </div>
      </header>

      {/* ── Stage area ── */}
      <div className="gateway-stages">

        {/* Stage content — kept in DOM so JS timers continue running when log is visible */}
        <div className={`gateway-content${showLog ? ' gateway-content--hidden' : ''}`}>
          {isIdle && (
            <div className="gateway-idle">
              {phase === 'analyzing' ? (
                <>
                  <span className="gateway-idle__icon gateway-idle__icon--analyzing">⚡</span>
                  <p>Privacy Intelligence Layer<br />analyzing request…</p>
                </>
              ) : (
                <>
                  <span className="gateway-idle__icon">{phase === 'idle' ? '▷' : '⏳'}</span>
                  <p>
                    {phase === 'idle'
                      ? <>Select a scenario and click <strong>Send</strong> to run the live pipeline.</>
                      : <>Ready — <strong>7 pipeline stages</strong> will execute when you send.</>}
                  </p>
                </>
              )}
            </div>
          )}

          {(phase === 'running' || phase === 'done') && (
            <div className="gateway-stage-list">
              {GATEWAY_STAGES.map((cfg, idx) => {
                const state    = stageState(idx);
                const isActive = state === 'active';
                const isDone   = state === 'done';

                return (
                  <div
                    key={cfg.id}
                    ref={el => { stageRefs.current[idx] = el; }}
                    className={`gateway-stage gateway-stage--${state}`}
                  >
                    <div className="gateway-stage__header">
                      <div className="gateway-stage__left">
                        <span className="gateway-stage__status-dot">
                          {isDone   && '✓'}
                          {isActive && <span className="spinner" />}
                          {state === 'pending' && '○'}
                        </span>
                        <span className="gateway-stage__icon">{cfg.icon}</span>
                        <span className="gateway-stage__label">{cfg.id}</span>
                      </div>
                      <span className="gateway-stage__state-tag">
                        {isDone   && 'complete'}
                        {isActive && 'running…'}
                        {state === 'pending' && 'queued'}
                      </span>
                    </div>

                    <p className="gateway-stage__desc">{cfg.desc}</p>

                    {(isActive || isDone) && (
                      <div className="gateway-stage__body">
                        {cfg.render({
                          active: isActive,
                          done:   isDone,
                          scenario,
                          onComplete: () => handleStageComplete(idx),
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Event log — replaces stage content when toggle is active */}
        {showLog && (
          <div className="gateway-event-log">
            <EventLogViewer events={eventLog} />
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="gateway-footer">
        <span className="gateway-footer__tag">
          {phase === 'analyzing' ? 'LIVE MODE' : 'DEMO MODE'}
        </span>
        {phase === 'running'   && <span className="gateway-footer__status live">Pipeline running…</span>}
        {phase === 'analyzing' && <span className="gateway-footer__status live">Analyzing…</span>}
        {phase === 'done'      && (
          <span className="gateway-footer__status done">
            ✓ Run complete · {scenario?.auditRows.length} outbound calls · 0 PII exposed
          </span>
        )}
        {(phase === 'idle' || phase === 'typing' || phase === 'ready') && (
          <span className="gateway-footer__status">Awaiting request</span>
        )}
      </div>
    </div>
  );
}

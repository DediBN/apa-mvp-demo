import { useEffect, useRef } from 'react';
import type { Scenario, ScenarioKey, PiiEntry } from '../scenarios';
import type { Phase, Mode, ExecuteTaskResult } from '../App';
import { useTypeWriter } from './TypeWriter';
import { TYPING_SPEED_MS } from '../timings';
import ScenarioPicker from './ScenarioPicker';
import './ConsolePanel.css';

interface Props {
  mode: Mode;
  scenario: Scenario | null;
  phase: Phase;
  livePrompt: string;
  analyzeError: string | null;
  executeResults: ExecuteTaskResult[] | null;
  executeError: string | null;
  onSelectScenario: (key: ScenarioKey) => void;
  onSelectLive: () => void;
  onLivePromptChange: (text: string) => void;
  onTypingDone: () => void;
  onSend: () => void;
  onReplayLive: () => void;
  onReset: () => void;
}

// ── Token re-hydration ────────────────────────────────────────────────────────
// Replaces [TOKEN] placeholders in cloud response text with their real values.
// Returns text segments tagged restored=true where a value was substituted.

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

interface Segment { text: string; restored: boolean; }

function rehydrate(text: string, piiMap: PiiEntry[]): Segment[] {
  if (!piiMap.length) return [{ text, restored: false }];

  const pattern = piiMap.map(e => escapeRe(e.token)).join('|');
  const regex = new RegExp(`(${pattern})`, 'g');
  const segments: Segment[] = [];
  let last = 0;

  for (const match of text.matchAll(regex)) {
    const idx = match.index!;
    if (idx > last) segments.push({ text: text.slice(last, idx), restored: false });
    const entry = piiMap.find(e => e.token === match[0]);
    segments.push({ text: entry ? entry.value : match[0], restored: !!entry });
    last = idx + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), restored: false });
  return segments;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ConsolePanel({
  mode, scenario, phase,
  livePrompt, analyzeError,
  executeResults, executeError,
  onSelectScenario, onSelectLive, onLivePromptChange,
  onTypingDone, onSend, onReplayLive, onReset,
}: Props) {
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const { displayed: typedRequest, done: typingDone } = useTypeWriter(
    mode === 'scripted' && phase === 'typing' && scenario ? scenario.request : '',
    TYPING_SPEED_MS,
  );

  useEffect(() => {
    if (typingDone && phase === 'typing' && mode === 'scripted') onTypingDone();
  }, [typingDone, phase, mode, onTypingDone]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [phase, executeResults]);

  const handleScriptedKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && phase === 'ready') {
      e.preventDefault();
      onSend();
    }
  };

  const scriptedInputText =
    phase === 'typing' ? typedRequest :
    phase === 'idle'   ? '' :
    scenario?.request ?? '';

  const showScriptedInput = mode === 'scripted' && scenario !== null && (phase === 'typing' || phase === 'ready');
  const showLiveInput     = mode === 'live' && (phase === 'typing' || phase === 'analyzing');
  const showInput         = showScriptedInput || showLiveInput;
  const showChat          = phase === 'running' || phase === 'done';

  const workspaceLabel = mode === 'live' && !scenario ? 'Live Mode' : scenario?.workspace;

  return (
    <div className="console-panel">

      {/* ── Header ── */}
      <header className="console-header">
        <div className="console-header__logo">
          <span className="console-header__logo-text">APA</span>
          <span className="console-header__logo-dot">●</span>
          <span className="console-header__logo-sub">Console</span>
        </div>
        {workspaceLabel && (
          <div className={`console-header__workspace${mode === 'live' ? ' console-header__workspace--live' : ''}`}>
            <span className="console-header__ws-icon">{mode === 'live' ? '⚡' : '🏢'}</span>
            <span>{workspaceLabel}</span>
          </div>
        )}
      </header>

      {/* ── Scenario picker ── */}
      <ScenarioPicker
        selected={mode === 'scripted' ? (scenario?.key ?? null) : null}
        onSelect={onSelectScenario}
        compact={phase !== 'idle'}
        liveSelected={mode === 'live'}
        onSelectLive={onSelectLive}
      />

      {/* ── Chat area ── */}
      <div className="console-chat">

        {!showInput && !showChat && (
          <div className="console-chat__empty">
            <div className="console-chat__empty-icon">💬</div>
            <p>Select a scenario above to begin</p>
          </div>
        )}

        {/* Scripted mode: preview bubble while typing */}
        {mode === 'scripted' && showScriptedInput && (
          <div className="console-chat__user-preview">
            <div className="chat-user-bubble chat-user-bubble--preview">
              <div className="chat-user-bubble__meta">
                <span className="chat-user-bubble__name">{scenario?.user}</span>
                <span className="chat-user-bubble__time">now</span>
              </div>
              <div className="chat-user-bubble__text">
                {scriptedInputText}
                {phase === 'typing' && <span className="type-cursor" />}
              </div>
            </div>
          </div>
        )}

        {/* Chat view: running + done */}
        {showChat && scenario && (
          <>
            {/* User message */}
            <div className="chat-user-bubble">
              <div className="chat-user-bubble__meta">
                <span className="chat-user-bubble__name">{scenario.user}</span>
                <span className="chat-user-bubble__time">just now</span>
              </div>
              <div className="chat-user-bubble__text">{scenario.request}</div>

              {scenario.attachedTable && (
                <div className="chat-table-attach">
                  <div className="chat-table-attach__label">
                    <span className="chat-table-attach__icon">📎</span>
                    <span>client_portfolio.csv — {scenario.attachedTable.rows.length} records</span>
                  </div>
                  <div className="chat-table-attach__scroll">
                    <table className="chat-table">
                      <thead>
                        <tr>{scenario.attachedTable.headers.map(h => <th key={h}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {scenario.attachedTable.rows.map((row, r) => (
                          <tr key={r}>
                            {row.map((cell, c) => (
                              <td key={c} className={scenario.attachedTable!.piiCols.includes(c) ? 'chat-table__cell--pii' : ''}>
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Working indicator */}
            {phase === 'running' && (
              <div className="chat-working">
                <div className="chat-working__dots"><span /><span /><span /></div>
                <span className="chat-working__label">
                  Processing · {scenario.tasks.filter(t => t.destination === 'local').length} local
                  · {scenario.tasks.filter(t => t.destination === 'cloud').length} cloud (masked)
                </span>
              </div>
            )}

            {/* Answer */}
            {phase === 'done' && (
              <div className="chat-answer">
                <div className="chat-answer__header">
                  <span className="chat-answer__avatar">A</span>
                  <span className="chat-answer__name">APA</span>
                  <span className="chat-answer__badge">AI · secured</span>
                </div>

                <div className="chat-answer__card">
                  <h3 className="chat-answer__title">{scenario.finalAnswer.title}</h3>
                  <p className="chat-answer__body">{scenario.finalAnswer.body}</p>
                  <div className="chat-answer__chips">
                    {scenario.answerChips.map(chip => (
                      <span key={chip} className="answer-chip">{chip}</span>
                    ))}
                  </div>
                </div>

                {/* ── Cloud response panel (live mode only) ── */}
                {mode === 'live' && (
                  <LiveResponsePanel
                    scenario={scenario}
                    executeResults={executeResults}
                    executeError={executeError}
                  />
                )}

                <div className="chat-answer__actions">
                  <button className="console-btn console-btn--secondary" onClick={onReset}>
                    ↺ Switch scenario
                  </button>
                  {mode === 'live' ? (
                    <button className="console-btn console-btn--primary" onClick={onReplayLive}>
                      ✎ Edit & Rerun
                    </button>
                  ) : (
                    <button className="console-btn console-btn--primary" onClick={() => onSelectScenario(scenario.key)}>
                      ▶ Run again
                    </button>
                  )}
                </div>
              </div>
            )}

            <div ref={chatBottomRef} />
          </>
        )}
      </div>

      {/* ── Input area ── */}
      <div className={`console-input-area${showInput ? ' console-input-area--visible' : ''}`}>
        {mode === 'live' ? (
          <>
            <textarea
              className="console-input-field console-live-textarea"
              value={livePrompt}
              onChange={e => onLivePromptChange(e.target.value)}
              placeholder="Describe a request involving client data — names, accounts, amounts, IDs…"
              disabled={phase === 'analyzing'}
              rows={4}
              aria-label="Live prompt"
            />
            {analyzeError && (
              <div className="console-analyze-error">
                <span>⚠</span><span>{analyzeError}</span>
              </div>
            )}
            <div className="console-input-row">
              <span className="console-input-hint">
                {phase === 'analyzing' && (
                  <span className="console-analyzing-label">
                    <span className="console-analyzing-dot" />
                    Analyzing request…
                  </span>
                )}
                {phase === 'typing' && livePrompt.trim()  && 'Click Send to analyze'}
                {phase === 'typing' && !livePrompt.trim() && 'Type a prompt to begin'}
              </span>
              <button
                className="console-send-btn"
                onClick={onSend}
                disabled={phase !== 'typing' || !livePrompt.trim()}
              >
                {phase === 'analyzing' ? '…' : 'Send →'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div
              className="console-input-field"
              onKeyDown={handleScriptedKeyDown}
              tabIndex={phase === 'ready' ? 0 : -1}
              role="textbox"
              aria-label="Request"
              aria-readonly
            >
              {scriptedInputText}
              {phase === 'typing' && <span className="type-cursor" />}
            </div>
            <div className="console-input-row">
              <span className="console-input-hint">
                {phase === 'typing' && 'Filling request…'}
                {phase === 'ready'  && 'Press Send or Enter to run'}
              </span>
              <button
                className="console-send-btn"
                onClick={onSend}
                disabled={phase !== 'ready'}
              >
                Send →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── LiveResponsePanel ─────────────────────────────────────────────────────────

interface LiveResponsePanelProps {
  scenario: Scenario;
  executeResults: ExecuteTaskResult[] | null;
  executeError: string | null;
}

function LiveResponsePanel({ scenario, executeResults, executeError }: LiveResponsePanelProps) {
  // Still waiting for apa-execute to return
  if (!executeResults && !executeError) {
    return (
      <div className="live-resp-panel live-resp-panel--loading">
        <div className="chat-working__dots" style={{ margin: '0 4px 0 0' }}>
          <span /><span /><span />
        </div>
        <span className="live-resp-loading-label">Assembling cloud responses…</span>
      </div>
    );
  }

  // Execute call failed
  if (executeError) {
    return (
      <div className="live-resp-panel live-resp-panel--error">
        <span>⚠</span>
        <span>Could not fetch cloud responses: {executeError}</span>
      </div>
    );
  }

  // No cloud tasks
  if (executeResults!.length === 0) {
    return (
      <div className="live-resp-panel live-resp-panel--empty">
        <span>🖥</span>
        <span>All tasks ran locally — no cloud responses.</span>
      </div>
    );
  }

  const cloudTasks = scenario.tasks.filter(t => t.destination === 'cloud');

  return (
    <div className="live-resp-panel">
      <div className="live-resp-panel__header">
        <span>☁</span>
        <span>Cloud responses · assembled on-premises</span>
        <span className="live-resp-panel__badge">RECONSTRUCTED</span>
      </div>

      <div className="live-resp-panel__legend">
        <span className="live-resp-restored live-resp-restored--sample">restored value</span>
        <span>= real data re-inserted from on-premises vault</span>
      </div>

      {executeResults!.map(result => {
        const task = cloudTasks.find(t => t.id === result.id);
        const title = task?.label ?? `Task ${result.id}`;

        return (
          <div key={result.id} className="live-resp-item">
            <div className="live-resp-item__title">
              <span className="live-resp-item__cloud-icon">☁</span>
              <span>{title}</span>
            </div>

            {result.error ? (
              <div className="live-resp-item__error">⚠ {result.error}</div>
            ) : result.response ? (
              <div className="live-resp-item__body">
                {rehydrate(result.response, scenario.piiMap).map((seg, i) =>
                  seg.restored
                    ? <mark key={i} className="live-resp-restored">{seg.text}</mark>
                    : <span key={i}>{seg.text}</span>
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { StageProps } from './types';
import './StageMask.css';

type CellPhase = 'normal' | 'flip-out' | 'token';

export default function StageMask({ active, done, scenario, onComplete }: StageProps) {
  const [cellPhase,    setCellPhase]    = useState<Map<string, CellPhase>>(new Map());
  const [vaultCount,   setVaultCount]   = useState(0);
  const [showEndState, setShowEndState] = useState(false);
  const completedRef = useRef(false);
  const cbRef        = useRef(onComplete);
  cbRef.current      = onComplete;

  useEffect(() => {
    if (!active && !done) {
      setCellPhase(new Map());
      setVaultCount(0);
      setShowEndState(false);
      completedRef.current = false;
    }
  }, [active, done]);

  useEffect(() => {
    if (!active || done) return;
    completedRef.current = false;

    const isTable = !!scenario?.attachedTable;
    const timers: ReturnType<typeof setTimeout>[] = [];

    if (isTable) {
      // ── TABLE MODE: cascade 18 cells at 120 ms intervals ────────────
      const table = scenario!.attachedTable!;
      const cells: string[] = [];
      for (let r = 0; r < table.rows.length; r++) {
        for (const c of table.piiCols) cells.push(`${r}_${c}`);
      }

      const INTERVAL    = 120;  // ms between flip starts
      const FLIP_OUT_MS = 90;   // scaleY 1→0

      cells.forEach((key, idx) => {
        // Begin flip-out
        timers.push(setTimeout(() => {
          setCellPhase(prev => new Map([...prev, [key, 'flip-out']]));
        }, idx * INTERVAL));

        // Replace with token
        timers.push(setTimeout(() => {
          setCellPhase(prev => new Map([...prev, [key, 'token']]));
          setVaultCount(idx + 1);
        }, idx * INTERVAL + FLIP_OUT_MS));
      });

      const allDoneAt = (cells.length - 1) * INTERVAL + FLIP_OUT_MS + 300;
      timers.push(setTimeout(() => setShowEndState(true), allDoneAt));
      timers.push(setTimeout(() => {
        if (!completedRef.current) { completedRef.current = true; cbRef.current(); }
      }, allDoneAt + 2400));

    } else {
      // ── TEXT MODE: flip PII tokens one by one ───────────────────────
      const piiMap  = scenario?.piiMap ?? [];
      const INTERVAL    = 300;
      const FLIP_OUT_MS = 150;

      piiMap.forEach((_, idx) => {
        timers.push(setTimeout(() => {
          setCellPhase(prev => new Map([...prev, [String(idx), 'flip-out']]));
        }, idx * INTERVAL));
        timers.push(setTimeout(() => {
          setCellPhase(prev => new Map([...prev, [String(idx), 'token']]));
          setVaultCount(idx + 1);
        }, idx * INTERVAL + FLIP_OUT_MS));
      });

      const allDoneAt = (piiMap.length - 1) * INTERVAL + FLIP_OUT_MS + 400;
      timers.push(setTimeout(() => setShowEndState(true), allDoneAt));
      timers.push(setTimeout(() => {
        if (!completedRef.current) { completedRef.current = true; cbRef.current(); }
      }, allDoneAt + 2000));
    }

    return () => timers.forEach(clearTimeout);
  }, [active, done, scenario]);

  if (!active && !done) return null;

  // ── TABLE MODE render ──────────────────────────────────────────────
  if (scenario?.attachedTable) {
    const table    = scenario.attachedTable;
    const totalPii = table.rows.length * table.piiCols.length;

    return (
      <div className="sm sm--table">
        {/* Vault counter */}
        <div className="sm__header">
          <span className="sm__header-label">OUTBOUND PAYLOAD · MASKING</span>
          <div className="sm__vault">
            <span className="sm__vault-icon">🔒</span>
            <span className={`sm__vault-num${vaultCount > 0 ? ' sm__vault-num--live' : ''}`}>
              {vaultCount}
            </span>
            <span className="sm__vault-total">/ {totalPii}</span>
          </div>
        </div>

        {/* Table with cascading token flips */}
        <div className="sm__table-wrap">
          <table className="sm__table">
            <thead>
              <tr>{table.headers.map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => {
                    const key     = `${r}_${c}`;
                    const isPii   = table.piiCols.includes(c);
                    const phase   = isPii ? (cellPhase.get(key) ?? 'normal') : 'normal';
                    const token   = table.tokenMap[key];

                    return (
                      <td key={c} className={`sm__cell ${isPii ? `sm__cell--${phase}` : ''}`}>
                        {phase === 'token' ? (
                          <span className="token-chip token-chip--enter">{token}</span>
                        ) : (
                          <span className={isPii && phase !== 'normal' ? 'sm__real-fading' : ''}>
                            {cell}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* End-state summary */}
        {showEndState && (
          <div className="sm__end-state">
            <span className="sm__end-icon">✓</span>
            <div className="sm__end-text">
              Outbound payload: <strong>structure + percentages only.</strong>
              <br />
              <span className="sm__end-zero">ZERO names · ZERO accounts · ZERO amounts.</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── TEXT MODE render ───────────────────────────────────────────────
  const piiMap = scenario?.piiMap ?? [];

  return (
    <div className="sm sm--text">
      <div className="sm__header">
        <span className="sm__header-label">CLOUD PROMPT · MASKING</span>
        <div className="sm__vault">
          <span className="sm__vault-icon">🔒</span>
          <span className={`sm__vault-num${vaultCount > 0 ? ' sm__vault-num--live' : ''}`}>
            {vaultCount}
          </span>
          <span className="sm__vault-total">/ {piiMap.length}</span>
        </div>
      </div>

      <div className="sm__token-list">
        {piiMap.map(({ value, token }, idx) => {
          const phase = cellPhase.get(String(idx)) ?? 'normal';
          return (
            <div key={idx} className="sm__token-row">
              <div className={`sm__token-real sm__token-real--${phase}`}>
                {value}
              </div>
              <span className="sm__token-arrow">→</span>
              {phase === 'token' ? (
                <span className="token-chip token-chip--enter">{token}</span>
              ) : (
                <span className="sm__token-placeholder">{token}</span>
              )}
            </div>
          );
        })}
      </div>

      {showEndState && (
        <div className="sm__end-state">
          <span className="sm__end-icon">✓</span>
          <span className="sm__end-text">
            Outbound prompt contains <strong>zero real PII.</strong>
          </span>
        </div>
      )}
    </div>
  );
}

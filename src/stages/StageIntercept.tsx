import { useEffect, useRef, useState } from 'react';
import type { StageProps } from './types';
import './StageIntercept.css';

// Splits request text into segments, marking PII spans.
function segmentText(text: string, piiMap: Array<{ value: string; token: string }>) {
  interface Match { start: number; end: number; value: string; idx: number }
  const matches: Match[] = [];
  piiMap.forEach(({ value }, idx) => {
    const pos = text.indexOf(value);
    if (pos !== -1) matches.push({ start: pos, end: pos + value.length, value, idx });
  });
  matches.sort((a, b) => a.start - b.start);

  const segs: Array<{ text: string; isPii: boolean; piiIdx: number }> = [];
  let last = 0;
  for (const m of matches) {
    if (m.start > last) segs.push({ text: text.slice(last, m.start), isPii: false, piiIdx: -1 });
    segs.push({ text: m.value, isPii: true, piiIdx: m.idx });
    last = m.end;
  }
  if (last < text.length) segs.push({ text: text.slice(last), isPii: false, piiIdx: -1 });
  return segs;
}

export default function StageIntercept({ active, done, scenario, onComplete }: StageProps) {
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const [scanDone, setScanDone]       = useState(false);
  const completedRef = useRef(false);
  const cbRef        = useRef(onComplete);
  cbRef.current      = onComplete;

  // Reset when deactivated
  useEffect(() => {
    if (!active && !done) {
      setHighlighted(new Set());
      setScanDone(false);
      completedRef.current = false;
    }
  }, [active, done]);

  useEffect(() => {
    if (!active || done) return;
    completedRef.current = false;

    const isTable = !!scenario?.attachedTable;
    const timers: ReturnType<typeof setTimeout>[] = [];

    if (isTable) {
      // ── TABLE MODE: cell-by-cell at 80 ms ───────────────────────────
      const table = scenario!.attachedTable!;
      const cells: string[] = [];
      for (let r = 0; r < table.rows.length; r++) {
        for (const c of table.piiCols) cells.push(`${r}_${c}`);
      }

      cells.forEach((key, idx) => {
        timers.push(setTimeout(() => {
          setHighlighted(prev => new Set([...prev, key]));
        }, idx * 80));
      });

      // Banner appears 300 ms after last cell
      const bannerAt = (cells.length - 1) * 80 + 300;
      timers.push(setTimeout(() => setScanDone(true), bannerAt));

      // Advance stage 2.6 s after banner
      timers.push(setTimeout(() => {
        if (!completedRef.current) { completedRef.current = true; cbRef.current(); }
      }, bannerAt + 2600));

    } else {
      // ── TEXT MODE: PII words at 280 ms ──────────────────────────────
      const piiMap = scenario?.piiMap ?? [];

      piiMap.forEach((_, idx) => {
        timers.push(setTimeout(() => {
          setHighlighted(prev => new Set([...prev, String(idx)]));
        }, idx * 280));
      });

      const bannerAt = (piiMap.length - 1) * 280 + 400;
      timers.push(setTimeout(() => setScanDone(true), bannerAt));

      timers.push(setTimeout(() => {
        if (!completedRef.current) { completedRef.current = true; cbRef.current(); }
      }, bannerAt + 2000));
    }

    return () => timers.forEach(clearTimeout);
  }, [active, done, scenario]);

  if (!active && !done) return null;

  // ── TABLE MODE render ──────────────────────────────────────────────
  if (scenario?.attachedTable) {
    const table      = scenario.attachedTable;
    const totalPii   = table.rows.length * table.piiCols.length;
    const entityCount = highlighted.size;

    return (
      <div className="si si--table">
        {/* Live counter */}
        <div className="si__counter">
          <span className="si__counter-label">ENTITIES DETECTED</span>
          <span className={`si__counter-num${entityCount > 0 ? ' si__counter-num--live' : ''}`}>
            {entityCount}
          </span>
          <span className="si__counter-total">/ {totalPii}</span>
        </div>

        {/* Data table */}
        <div className="si__table-wrap">
          <table className="si__table">
            <thead>
              <tr>{table.headers.map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => {
                    const isPii  = table.piiCols.includes(c);
                    const isHit  = isPii && highlighted.has(`${r}_${c}`);
                    return (
                      <td key={c} className={isHit ? 'si__cell si__cell--pii' : 'si__cell'}>
                        {cell}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Kill-shot banner */}
        {scanDone && (
          <div className="si__banner si__banner--bulk">
            <span className="si__banner-dot">🔴</span>
            <div className="si__banner-text">
              <strong>BULK DATA DETECTED</strong>
              {' '}— {totalPii} sensitive entities across {table.rows.length} client records.
              <span className="si__banner-ks">
                Without APA, this entire table would have left the organization.
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── TEXT MODE render ───────────────────────────────────────────────
  const piiMap    = scenario?.piiMap ?? [];
  const request   = scenario?.request ?? '';
  const segments  = segmentText(request, piiMap);
  const entityCount = highlighted.size;

  return (
    <div className="si si--text">
      <div className="si__counter">
        <span className="si__counter-label">ENTITIES DETECTED</span>
        <span className={`si__counter-num${entityCount > 0 ? ' si__counter-num--live' : ''}`}>
          {entityCount}
        </span>
        <span className="si__counter-total">/ {piiMap.length}</span>
      </div>

      <div className="si__text-block">
        {segments.map((seg, i) =>
          seg.isPii ? (
            <mark
              key={i}
              className={`si__pii-word${highlighted.has(String(seg.piiIdx)) ? ' si__pii-word--hit' : ''}`}
            >
              {seg.text}
            </mark>
          ) : (
            <span key={i}>{seg.text}</span>
          )
        )}
      </div>

      {scanDone && (
        <div className="si__banner">
          <span>🔍</span>
          <span>{piiMap.length} sensitive entities detected — will be masked before any cloud call.</span>
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef } from 'react';
import type { StageProps } from './types';

interface Props extends StageProps {
  durationMs?: number;
  doneNote?: string;
}

export default function StageStub({ active, done, onComplete, durationMs = 2000, doneNote }: Props) {
  const cbRef = useRef(onComplete);
  cbRef.current = onComplete;

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => cbRef.current(), durationMs);
    return () => clearTimeout(t);
  }, [active, durationMs]);

  if (!active && !done) return null;

  return (
    <div className="stage-stub-body">
      {active && (
        <div className="stage-stub-body__bar">
          <div className="stage-stub-body__fill" />
        </div>
      )}
      {done && doneNote && (
        <p className="stage-stub-body__note">{doneNote}</p>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';

// Hook — use when you need the value (e.g. inside a div or textarea)
export function useTypeWriter(text: string, speedMs = 18) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!text) { setDisplayed(''); setDone(false); return; }
    setDisplayed('');
    setDone(false);
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(id);
        setDone(true);
      }
    }, speedMs);
    return () => clearInterval(id);
  }, [text, speedMs]);

  return { displayed, done };
}

// Component — use for inline text rendering
interface Props {
  text: string;
  speedMs?: number;
  onComplete?: () => void;
  className?: string;
}

export default function TypeWriter({ text, speedMs = 18, onComplete, className }: Props) {
  const { displayed, done } = useTypeWriter(text, speedMs);
  const cbRef = useRef(onComplete);
  cbRef.current = onComplete;

  useEffect(() => {
    if (done) cbRef.current?.();
  }, [done]);

  return <span className={className}>{displayed}</span>;
}

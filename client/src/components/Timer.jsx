import { useState, useEffect } from 'react';
import { useRetro } from '../context/RetroContext';

export default function Timer() {
  const { state } = useRetro();
  const endsAt = state.retro?.phase_ends_at;
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    if (!endsAt) {
      setRemaining(null);
      return;
    }
    function tick() {
      const diff = Math.max(0, Math.floor((new Date(endsAt).getTime() - Date.now()) / 1000));
      setRemaining(diff);
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  if (remaining === null || remaining <= 0) return null;

  const mins = String(Math.floor(remaining / 60)).padStart(2, '0');
  const secs = String(remaining % 60).padStart(2, '0');

  const style = {
    textAlign: 'center',
    padding: '8px 0 12px',
    fontSize: 28,
    fontWeight: 700,
    fontFamily: 'monospace',
    color: remaining < 30 ? 'var(--color-didnt)' : 'var(--color-well)',
  };

  return <div style={style}>{mins}:{secs}</div>;
}

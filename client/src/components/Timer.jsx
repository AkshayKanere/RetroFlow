import { useState, useEffect } from 'react';
import { useRetro } from '../context/RetroContext';

export default function Timer() {
  const { state } = useRetro();
  const endsAt = state.retro?.phase_ends_at;
  const [remaining, setRemaining] = useState(null);
  const [showTimesUp, setShowTimesUp] = useState(false);

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

  useEffect(() => {
    if (remaining === 0) {
      setShowTimesUp(true);
      const timeout = setTimeout(() => setShowTimesUp(false), 5000);
      return () => clearTimeout(timeout);
    }
  }, [remaining]);

  if (remaining === null) return null;

  if (remaining === 0 && showTimesUp) {
    const timesUpStyle = {
      textAlign: 'center',
      padding: '8px 0 12px',
      fontSize: 28,
      fontWeight: 700,
      fontFamily: 'monospace',
      color: 'var(--color-didnt)',
      animation: 'pulse 1s ease-in-out infinite',
    };

    return (
      <>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.6; transform: scale(1.05); } }`}</style>
        <div style={timesUpStyle}>Time&apos;s up!</div>
      </>
    );
  }

  if (remaining <= 0) return null;

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

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { useRetro } from '../context/RetroContext';

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    background: 'var(--bg-primary)',
  },
  form: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 40,
    width: 400,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  title: {
    color: 'var(--text-primary)',
    fontSize: 22,
    fontWeight: 700,
    textAlign: 'center',
  },
  label: {
    color: 'var(--text-secondary)',
    fontSize: 13,
    marginBottom: 4,
    display: 'block',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text-primary)',
    fontSize: 14,
    outline: 'none',
  },
  button: {
    padding: '12px 0',
    background: 'var(--color-well)',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
  },
  error: {
    color: 'var(--color-didnt)',
    fontSize: 13,
    textAlign: 'center',
  },
};

export default function JoinForm() {
  const { shareCode } = useParams();
  const navigate = useNavigate();
  const socket = useSocket();
  const { dispatch } = useRetro();
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('retroSession'));
      if (saved && saved.shareCode === shareCode && saved.participantId) {
        navigate(`/retro/${shareCode}/board`, { replace: true });
      }
    } catch {}
  }, [shareCode, navigate]);

  function handleSubmit(e) {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('Display name is required');
      return;
    }
    setLoading(true);
    setError('');
    socket.emit('join-retro', { shareCode, displayName: displayName.trim(), facilitatorToken: sessionStorage.getItem('facilitatorToken') || null }, (response) => {
      setLoading(false);
      if (response.error) {
        setError(response.error);
        return;
      }
      dispatch({ type: 'SET_PARTICIPANT', payload: response.participant });
      dispatch({
        type: 'SET_STATE',
        payload: {
          retro: response.retro,
          participants: response.participants,
          cards: response.cards,
          votes: response.votes,
        },
      });
      sessionStorage.setItem('retroSession', JSON.stringify({
        participantId: response.participant.id,
        shareCode,
        displayName: displayName.trim(),
      }));
      navigate(`/retro/${shareCode}/board`);
    });
  }

  return (
    <div style={styles.container}>
      <form style={styles.form} onSubmit={handleSubmit} aria-label="Join Retrospective">
        <div style={styles.title}>Join Retrospective</div>
        <div>
          <label style={styles.label} htmlFor="displayName">Display Name</label>
          <input
            id="displayName"
            style={styles.input}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            maxLength={50}
            autoFocus
          />
        </div>
        {error && <div style={styles.error}>{error}</div>}
        <button style={styles.button} type="submit" disabled={loading}>
          {loading ? 'Joining...' : 'Join'}
        </button>
      </form>
    </div>
  );
}

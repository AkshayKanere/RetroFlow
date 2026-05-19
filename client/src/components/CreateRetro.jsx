import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
    width: 420,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  title: {
    color: 'var(--text-primary)',
    fontSize: 24,
    fontWeight: 700,
    textAlign: 'center',
    marginBottom: 8,
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
    marginTop: 8,
  },
  error: {
    color: 'var(--color-didnt)',
    fontSize: 13,
    textAlign: 'center',
  },
};

export default function CreateRetro() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [addMinutes, setAddMinutes] = useState(10);
  const [voteMinutes, setVoteMinutes] = useState(10);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/retros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          addPointsDuration: Number(addMinutes) * 60,
          votingDuration: Number(voteMinutes) * 60,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create retro');
        return;
      }
      navigate(`/retro/${data.retro.share_code}`);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <form style={styles.form} onSubmit={handleSubmit}>
        <div style={styles.title}>Create Retrospective</div>
        <div>
          <label style={styles.label}>Title</label>
          <input
            style={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Sprint 42 Retrospective"
          />
        </div>
        <div>
          <label style={styles.label}>Add Points Timer (minutes)</label>
          <input
            style={styles.input}
            type="number"
            min={1}
            value={addMinutes}
            onChange={(e) => setAddMinutes(e.target.value)}
          />
        </div>
        <div>
          <label style={styles.label}>Voting Timer (minutes)</label>
          <input
            style={styles.input}
            type="number"
            min={1}
            value={voteMinutes}
            onChange={(e) => setVoteMinutes(e.target.value)}
          />
        </div>
        {error && <div style={styles.error}>{error}</div>}
        <button style={styles.button} type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Create Retro'}
        </button>
      </form>
    </div>
  );
}

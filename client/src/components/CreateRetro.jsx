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
  const [title, setTitle] = useState('Sprint');
  const [addMinutes, setAddMinutes] = useState(10);
  const [voteMinutes, setVoteMinutes] = useState(5);
  const [maxParticipants, setMaxParticipants] = useState(30);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [copied, setCopied] = useState(false);

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
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + sessionStorage.getItem('facilitatorToken'),
        },
        body: JSON.stringify({
          title: title.trim(),
          addPointsDuration: Number(addMinutes) * 60,
          votingDuration: Number(voteMinutes) * 60,
          maxParticipants: Number(maxParticipants),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create retro');
        return;
      }
      const link = `${window.location.origin}/retro/${data.retro.share_code}`;
      setShareLink(link);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  function handleJoin() {
    const code = shareLink.split('/retro/')[1];
    navigate(`/retro/${code}`);
  }

  if (shareLink) {
    return (
      <div style={styles.container}>
        <div style={styles.form}>
          <div style={styles.title}>Retro Created!</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 14, textAlign: 'center' }}>
            Share this link with your team:
          </div>
          <div style={{
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '12px 14px',
            color: 'var(--color-well)',
            fontSize: 13,
            wordBreak: 'break-all',
            textAlign: 'center',
          }}>
            {shareLink}
          </div>
          <button style={{ ...styles.button, background: 'var(--color-action)' }} onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
          <button style={styles.button} onClick={handleJoin}>
            Join Retro
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <form style={styles.form} onSubmit={handleSubmit} aria-label="Create Retrospective">
        <div style={styles.title}>Create Retrospective</div>
        <div>
          <label style={styles.label} htmlFor="title">Title</label>
          <input
            id="title"
            style={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Sprint 42 Retrospective"
            maxLength={100}
          />
        </div>
        <div>
          <label style={styles.label} htmlFor="addMinutes">Add Points Timer (minutes)</label>
          <input
            id="addMinutes"
            style={styles.input}
            type="number"
            min={1}
            max={60}
            value={addMinutes}
            onChange={(e) => setAddMinutes(e.target.value)}
          />
        </div>
        <div>
          <label style={styles.label} htmlFor="voteMinutes">Voting Timer (minutes)</label>
          <input
            id="voteMinutes"
            style={styles.input}
            type="number"
            min={1}
            max={60}
            value={voteMinutes}
            onChange={(e) => setVoteMinutes(e.target.value)}
          />
        </div>
        <div>
          <label style={styles.label} htmlFor="maxParticipants">Max Participants</label>
          <input
            id="maxParticipants"
            style={styles.input}
            type="number"
            min={1}
            max={60}
            value={maxParticipants}
            onChange={(e) => setMaxParticipants(e.target.value)}
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

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
  backLink: {
    color: 'var(--text-secondary)',
    fontSize: 13,
    textAlign: 'center',
    cursor: 'pointer',
    textDecoration: 'underline',
    background: 'none',
    border: 'none',
  },
};

export default function FacilitatorLogin() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password) {
      setError('Password is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/facilitator/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }
      sessionStorage.setItem('facilitatorToken', data.token);
      navigate('/');
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <form style={styles.form} onSubmit={handleSubmit} aria-label="Facilitator Login">
        <div style={styles.title}>Facilitator Login</div>
        <div>
          <label style={styles.label} htmlFor="password">Password</label>
          <input
            id="password"
            style={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter facilitator password"
            autoFocus
          />
        </div>
        {error && <div style={styles.error}>{error}</div>}
        <button style={styles.button} type="submit" disabled={loading}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
        <button type="button" style={styles.backLink} onClick={() => navigate('/')}>
          Back to Home
        </button>
      </form>
    </div>
  );
}

import { useNavigate } from 'react-router-dom';

const styles = {
  container: {
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '40px 24px',
  },
  card: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 40,
    maxWidth: 480,
    width: '100%',
    textAlign: 'center',
  },
  code: {
    color: 'var(--color-well)',
    fontSize: 64,
    fontWeight: 700,
    marginBottom: 8,
  },
  title: {
    color: 'var(--text-primary)',
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 12,
  },
  message: {
    color: 'var(--text-secondary)',
    fontSize: 14,
    marginBottom: 24,
  },
  btn: {
    padding: '10px 20px',
    background: 'var(--color-well)',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
};

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.code}>404</div>
        <div style={styles.title}>Page Not Found</div>
        <div style={styles.message}>
          The page you are looking for does not exist or has been moved.
        </div>
        <button style={styles.btn} onClick={() => navigate('/')} aria-label="Go to home page">
          Go Home
        </button>
      </div>
    </div>
  );
}

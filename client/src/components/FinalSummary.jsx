import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const COLUMN_LABELS = {
  well: 'What Went Well',
  didnt: "What Didn't Go Well",
  action: 'Action Items',
};

const styles = {
  container: {
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    padding: '40px 24px',
    maxWidth: 800,
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    color: 'var(--text-primary)',
    fontSize: 24,
    fontWeight: 700,
  },
  badge: {
    background: 'var(--color-didnt)',
    color: '#fff',
    padding: '4px 10px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
  },
  section: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    color: 'var(--text-secondary)',
    fontSize: 12,
    textTransform: 'uppercase',
    fontWeight: 600,
    marginBottom: 12,
  },
  summaryText: {
    color: 'var(--text-primary)',
    fontSize: 14,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
  },
  card: {
    padding: '8px 12px',
    background: 'var(--bg-primary)',
    borderRadius: 6,
    marginBottom: 8,
    color: 'var(--text-primary)',
    fontSize: 13,
    display: 'flex',
    justifyContent: 'space-between',
  },
  backBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    padding: '8px 16px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
  },
};

export default function FinalSummary() {
  const { shareCode } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/retros')
      .then(r => r.json())
      .then(({ retros }) => {
        const retro = retros.find(r => r.share_code === shareCode);
        if (!retro) return;
        return fetch('/api/retros/' + retro.id + '/state')
          .then(r => r.json())
          .then(state => setData({ retro, ...state }));
      })
      .finally(() => setLoading(false));
  }, [shareCode]);

  if (loading) {
    return <div style={{ ...styles.container, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</div>;
  }

  if (!data) {
    return <div style={{ ...styles.container, textAlign: 'center', color: 'var(--text-secondary)' }}>Retro not found.</div>;
  }

  const { retro, cards, votes, summary } = data;

  const voteCounts = {};
  for (const v of (votes || [])) {
    voteCounts[v.card_id] = (voteCounts[v.card_id] || 0) + 1;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>{retro.title}</div>
          <span style={styles.badge}>ENDED</span>
        </div>
        <button style={styles.backBtn} onClick={() => navigate('/')}>Back to Home</button>
      </div>

      {summary && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>AI Summary</div>
          <div style={styles.summaryText}>{summary.text || summary}</div>
        </div>
      )}

      {Object.entries(COLUMN_LABELS).map(([col, label]) => {
        const colCards = (cards || []).filter(c => c.column === col && !c.group_id);
        return (
          <div key={col} style={styles.section}>
            <div style={styles.sectionTitle}>{label}</div>
            {colCards.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No cards</div>
            ) : (
              colCards.map(c => (
                <div key={c.id} style={styles.card}>
                  <span>{c.text}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{voteCounts[c.id] || 0} votes</span>
                </div>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}

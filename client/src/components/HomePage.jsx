import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const styles = {
  container: {
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    padding: '40px 24px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: {
    color: 'var(--color-well)',
    fontWeight: 700,
    fontSize: 24,
  },
  loginLink: {
    color: 'var(--color-action)',
    cursor: 'pointer',
    fontSize: 14,
    textDecoration: 'underline',
    background: 'none',
    border: 'none',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    background: 'var(--bg-secondary)',
    borderRadius: 10,
    overflow: 'hidden',
  },
  th: {
    textAlign: 'left',
    padding: '12px 16px',
    color: 'var(--text-secondary)',
    fontSize: 12,
    textTransform: 'uppercase',
    borderBottom: '1px solid var(--border)',
  },
  td: {
    padding: '12px 16px',
    color: 'var(--text-primary)',
    fontSize: 14,
    borderBottom: '1px solid var(--border)',
  },
  btn: {
    padding: '6px 12px',
    border: 'none',
    borderRadius: 5,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    marginRight: 8,
  },
  joinBtn: {
    background: 'var(--color-well)',
    color: '#fff',
  },
  viewBtn: {
    background: 'var(--border)',
    color: 'var(--text-primary)',
  },
  createBtn: {
    padding: '10px 20px',
    background: 'var(--color-well)',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  empty: {
    textAlign: 'center',
    color: 'var(--text-secondary)',
    padding: 40,
    fontSize: 14,
  },
};

export default function HomePage() {
  const navigate = useNavigate();
  const [retros, setRetros] = useState([]);
  const [llmConfigured, setLlmConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const isFacilitator = !!sessionStorage.getItem('facilitatorToken');

  useEffect(() => {
    Promise.all([
      fetch('/api/retros').then(r => r.json()),
      fetch('/api/config').then(r => r.json()),
    ]).then(([retrosData, configData]) => {
      setRetros(retrosData.retros || []);
      setLlmConfigured(configData.llmConfigured);
      setLoading(false);
    });
  }, []);

  const activeRetro = retros.find(r => r.phase !== 'ended');
  const endedRetros = retros.filter(r => r.phase === 'ended');

  function handleExportExcel(id) {
    window.open('/api/retros/' + id + '/export/excel', '_blank');
  }

  function handleExportSummary(id) {
    window.open('/api/retros/' + id + '/export/summary', '_blank');
  }

  if (loading) {
    return (
      <div style={{ ...styles.container, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.logo}>RetroBoard</span>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {isFacilitator && !activeRetro && (
            <button style={styles.createBtn} onClick={() => navigate('/create')}>
              Create New Retro
            </button>
          )}
          {isFacilitator && activeRetro && (
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Active retro exists</span>
          )}
          {!isFacilitator && (
            <button style={styles.loginLink} onClick={() => navigate('/facilitator')}>
              Facilitator Login
            </button>
          )}
          {isFacilitator && (
            <span style={{ color: 'var(--color-well)', fontSize: 12, fontWeight: 600 }}>Facilitator</span>
          )}
        </div>
      </div>

      {activeRetro && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--color-well)', borderRadius: 10, padding: 20, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: 'var(--color-well)', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>ACTIVE RETRO</div>
              <div style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 600 }}>{activeRetro.title}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>Phase: {activeRetro.phase}</div>
            </div>
            <button
              style={{ ...styles.btn, ...styles.joinBtn, padding: '10px 24px', fontSize: 14 }}
              onClick={() => navigate('/retro/' + activeRetro.share_code)}
            >
              Join
            </button>
          </div>
        </div>
      )}

      <div style={{ color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase', marginBottom: 12, fontWeight: 600 }}>
        Past Retrospectives
      </div>

      {endedRetros.length === 0 ? (
        <div style={styles.empty}>No completed retrospectives yet.</div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Title</th>
              <th style={styles.th}>Date</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {endedRetros.map(r => (
              <tr key={r.id}>
                <td style={styles.td}>{r.title}</td>
                <td style={styles.td}>{new Date(r.created_at).toLocaleDateString()}</td>
                <td style={styles.td}>
                  <button style={{ ...styles.btn, ...styles.viewBtn }} onClick={() => navigate('/retro/' + r.share_code + '/summary')}>
                    View Summary
                  </button>
                  <button style={{ ...styles.btn, ...styles.viewBtn }} onClick={() => handleExportExcel(r.id)}>
                    Export Excel
                  </button>
                  {llmConfigured && (
                    <button style={{ ...styles.btn, ...styles.viewBtn }} onClick={() => handleExportSummary(r.id)}>
                      Export Summary.md
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

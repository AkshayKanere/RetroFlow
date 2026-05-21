import { Component } from 'react';

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
  title: {
    color: 'var(--color-didnt)',
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
    border: 'none',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    marginRight: 8,
  },
  homeBtn: {
    background: 'var(--color-well)',
    color: '#fff',
  },
  retryBtn: {
    background: 'var(--border)',
    color: 'var(--text-primary)',
  },
};

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  handleGoHome = () => {
    this.setState({ hasError: false });
    window.location.href = '/';
  };

  handleTryAgain = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.container}>
          <div style={styles.card}>
            <div style={styles.title}>Something went wrong</div>
            <div style={styles.message}>
              An unexpected error occurred. Please try again or return to the home page.
            </div>
            <div>
              <button style={{ ...styles.btn, ...styles.homeBtn }} onClick={this.handleGoHome} aria-label="Go Home">
                Go Home
              </button>
              <button style={{ ...styles.btn, ...styles.retryBtn }} onClick={this.handleTryAgain} aria-label="Try Again">
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

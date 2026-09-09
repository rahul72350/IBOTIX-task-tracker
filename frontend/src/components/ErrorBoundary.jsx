import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('React crash caught by ErrorBoundary:', error, info)
    this.setState({ info })
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="msg-page">
        <div className="msg-wrap">
          <div className="msg-alert">
            <h1>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" />
              </svg>
              Something crashed in the app
            </h1>
            <p>
              The exact error is below. This is a code or data problem, not a blank
              page — copy this message when asking for help.
            </p>
          </div>

          <div className="msg-card">
            <div className="cap">Error message</div>
            <pre>{String(this.state.error?.message || this.state.error)}</pre>
          </div>

          {this.state.error?.stack && (
            <details className="msg-card">
              <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                Technical details (stack trace)
              </summary>
              <pre style={{ marginTop: 12, fontSize: 11.5, color: 'var(--text-secondary)' }}>
                {this.state.error.stack}
              </pre>
            </details>
          )}

          <button className="msg-btn" onClick={() => window.location.reload()}>
            Reload the page
          </button>
        </div>
      </div>
    )
  }
}

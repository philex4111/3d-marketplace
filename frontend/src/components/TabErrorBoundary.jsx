import { Component } from 'react'

/**
 * Catches render errors in dashboard tabs so one broken tab does not blank the page.
 */
export class TabErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mesh-card p-6 max-w-lg">
          <p className="font-mono text-sm text-red-400 mb-2">
            This section failed to load.
          </p>
          <p className="font-mono text-[11px] text-white/40 break-words">
            {this.state.error.message}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="btn-ghost text-xs mt-4"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

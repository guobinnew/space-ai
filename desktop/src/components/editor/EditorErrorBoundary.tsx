import { Component, type ReactNode } from 'react'

type Props = {
  children: ReactNode
}

type State = {
  hasError: boolean
  error: Error | null
}

export class EditorErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[EditorErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full bg-[var(--color-surface)] text-[var(--color-text-secondary)] p-6">
          <span className="material-symbols-outlined text-[40px] text-[var(--color-error)] mb-3">error</span>
          <p className="text-sm font-medium mb-2">Editor crashed</p>
          <p className="text-xs text-[var(--color-text-tertiary)] max-w-[300px] text-center mb-4">
            {this.state.error?.message || 'Unknown error'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-3 py-1.5 rounded text-xs bg-[var(--color-brand)] text-[var(--color-btn-primary-fg)] hover:opacity-90 transition-colors"
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

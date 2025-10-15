import { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
    
    // You can also log the error to an error reporting service here
    console.error('Error caught by ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-brand-black flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-brand-gray rounded-lg shadow-lg p-6 border border-brand-yellow/20">
            <h2 className="text-2xl font-bold text-brand-yellow mb-4">Oops! Something went wrong</h2>
            <div className="space-y-4">
              <p className="text-gray-300">
                We're sorry, but something unexpected happened. Please try refreshing the page or contact support if the problem persists.
              </p>
              {process.env.NODE_ENV === 'development' && (
                <div className="mt-4">
                  <p className="text-red-400 text-sm font-mono">
                    {this.state.error?.toString()}
                  </p>
                  <pre className="mt-2 text-xs text-gray-400 overflow-auto p-2 bg-black/50 rounded">
                    {this.state.errorInfo?.componentStack}
                  </pre>
                </div>
              )}
              <div className="flex gap-4 mt-6">
                <button
                  onClick={() => window.location.reload()}
                  className="bg-brand-yellow text-brand-black px-4 py-2 rounded hover:bg-brand-yellowDark transition-colors"
                >
                  Refresh Page
                </button>
                <button
                  onClick={() => window.history.back()}
                  className="border border-brand-yellow/20 text-gray-300 px-4 py-2 rounded hover:bg-brand-yellow/10 transition-colors"
                >
                  Go Back
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
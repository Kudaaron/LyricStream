import { Component } from 'react';

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error, info) {
        // eslint-disable-next-line no-console
        console.error('LyricStream error boundary caught:', error, info);
    }

    handleReset = () => {
        this.setState({ hasError: false });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="error-boundary">
                    <div className="error-boundary-icon">
                        <i className="ti ti-alert-triangle" />
                    </div>
                    <h2 className="error-boundary-title">Something went wrong</h2>
                    <p className="error-boundary-sub">
                        {this.props.message || 'This part of the app hit a snag.'}
                    </p>
                    <button className="btn-primary" onClick={this.handleReset}>
                        <i className="ti ti-refresh" /> Try again
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
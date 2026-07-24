import React from 'react';

// Catches render errors anywhere below it in the tree so one bad component
// (e.g. a malformed API response reaching a chart/list render) shows a
// recoverable error state instead of blanking the entire dashboard.
export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
        this.handleReset = this.handleReset.bind(this);
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error('[dashboard] Unhandled render error', error, info);
    }

    handleReset() {
        this.setState({ error: null });
    }

    render() {
        if (this.state.error) {
            return (
                <div className="cp-error-state" role="alert">
                    <p>Something went wrong displaying this page.</p>
                    <button type="button" className="cp-btn cp-btn--secondary" onClick={this.handleReset}>
                        Try again
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

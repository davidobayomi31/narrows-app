// App-wide error boundary. Wraps the whole app so that an unexpected render
// crash shows a recoverable fallback screen instead of a frozen white screen,
// and reports the crash (lib/logError -> client_errors table -> alert webhook).
//
// Note: React error boundaries only catch errors thrown during render/lifecycle
// of the React tree. Errors inside async callbacks (network handlers, etc.) are
// caught locally with try/catch + friendlyError; unhandled promise rejections
// are captured by the global handler installed in App.tsx.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
import { logError } from '../../lib/logError';

type Props = { children: React.ReactNode };
type State = { hasError: boolean };

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    logError(error, {
      source: 'ErrorBoundary',
      extra: { componentStack: info.componentStack },
    });
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          The app hit an unexpected error. Your data is safe — try again.
        </Text>
        <TouchableOpacity style={styles.button} onPress={this.handleReset}>
          <Text style={styles.buttonText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  title: {
    color: Colors.cream,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    color: Colors.muted,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  button: {
    backgroundColor: Colors.gold,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
  },
  buttonText: {
    color: Colors.black,
    fontSize: 15,
    fontWeight: '700',
  },
});

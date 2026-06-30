import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect, useRootNavigationState } from 'expo-router';
import { useAuth } from '../lib/auth';

// Entry gate: wait for the stored session to load, then route to the tabs
// (signed in) or the login screen.
export default function Index() {
  const { loading, token } = useAuth();
  const navState = useRootNavigationState();

  if (loading || !navState?.key) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a' }}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }
  return <Redirect href={token ? '/(tabs)' : '/login'} />;
}

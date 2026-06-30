import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect, useRootNavigationState } from 'expo-router';
import { useAuth } from '../lib/auth';

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

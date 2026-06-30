import { Tabs } from 'expo-router';
import { Text } from 'react-native';

// Native bottom tab bar — the standard mobile fantasy-app navigation.
function Icon({ emoji, color }: { emoji: string; color: string }) {
  return <Text style={{ fontSize: 20, color }}>{emoji}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#0f172a' },
        headerTintColor: '#fff',
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: { backgroundColor: '#fff', borderTopColor: '#e2e8f0' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Wire', tabBarIcon: ({ color }) => <Icon emoji="📡" color={color} /> }} />
      <Tabs.Screen name="standings" options={{ title: 'Standings', tabBarIcon: ({ color }) => <Icon emoji="🏆" color={color} /> }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: ({ color }) => <Icon emoji="👤" color={color} /> }} />
    </Tabs>
  );
}

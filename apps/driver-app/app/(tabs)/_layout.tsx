import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#1a7f37' }}>
      <Tabs.Screen name="map" options={{ title: 'Map' }} />
      <Tabs.Screen name="sessions" options={{ title: 'Sessions' }} />
      <Tabs.Screen name="wallet" options={{ title: 'Wallet' }} />
    </Tabs>
  );
}

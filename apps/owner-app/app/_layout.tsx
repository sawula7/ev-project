import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ title: 'Register' }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="claim" options={{ title: 'Claim Charger' }} />
        <Stack.Screen name="charger/[id]" options={{ title: 'Charger Settings' }} />
        <Stack.Screen name="payouts" options={{ title: 'Payouts' }} />
      </Stack>
    </SafeAreaProvider>
  );
}

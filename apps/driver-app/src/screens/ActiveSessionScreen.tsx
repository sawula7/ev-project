import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getSession, stopSession, SessionData } from '../services/api';
import { useSessionStore } from '../services/store';

export default function ActiveSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const [session, setSession] = useState<SessionData | null>(null);
  const [stopping, setStopping] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchSession() {
    try {
      const data = await getSession(id);
      setSession(data);
      if (data.status === 'completed' || data.status === 'failed') {
        clearInterval(intervalRef.current!);
        setActiveSession(null);
      }
    } catch {}
  }

  useEffect(() => {
    fetchSession();
    intervalRef.current = setInterval(fetchSession, 10_000); // poll every 10s
    return () => clearInterval(intervalRef.current!);
  }, [id]);

  async function handleStop() {
    setStopping(true);
    try {
      await stopSession(id);
      Alert.alert('Stop requested', 'The charger will stop shortly');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not stop session');
    } finally {
      setStopping(false);
    }
  }

  if (!session) return <View style={styles.center}><ActivityIndicator size="large" color="#1a7f37" /></View>;

  const isCompleted = session.status === 'completed';
  const energyKwh = (session.energyDeliveredWh / 1000).toFixed(2);
  const cost = (session.accruedAmount / 100).toFixed(2);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{isCompleted ? 'Session Complete' : 'Charging...'}</Text>

      <View style={styles.card}>
        <Stat label="Energy delivered" value={`${energyKwh} kWh`} />
        <Stat label="Cost so far" value={`LKR ${cost}`} />
        <Stat label="Status" value={session.status.toUpperCase()} />
        {session.startTime && (
          <Stat label="Started" value={new Date(session.startTime).toLocaleTimeString()} />
        )}
        {session.stopTime && (
          <Stat label="Ended" value={new Date(session.stopTime).toLocaleTimeString()} />
        )}
      </View>

      {isCompleted ? (
        <TouchableOpacity style={styles.btn} onPress={() => router.replace('/(tabs)/map')}>
          <Text style={styles.btnText}>Back to map</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={[styles.btn, styles.stopBtn]} onPress={handleStop} disabled={stopping}>
          {stopping ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Stop Charging</Text>}
        </TouchableOpacity>
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 32 },
  card: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 16, marginBottom: 32 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  label: { color: '#666', fontSize: 15 },
  value: { fontSize: 15, fontWeight: '600' },
  btn: { backgroundColor: '#1a7f37', borderRadius: 8, padding: 18, alignItems: 'center' },
  stopBtn: { backgroundColor: '#ef4444' },
  btnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});

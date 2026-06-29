import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getCharger, startSession, ChargerData } from '../services/api';
import { useSessionStore } from '../services/store';
import { ChargerStatus } from '@ev/shared';

export default function ChargerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const [charger, setCharger] = useState<ChargerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    getCharger(id).then(setCharger).catch(() => Alert.alert('Charger not found')).finally(() => setLoading(false));
  }, [id]);

  async function handleStart() {
    if (!charger) return;
    setStarting(true);
    try {
      const { sessionId } = await startSession(charger._id);
      setActiveSession({ _id: sessionId, chargerId: charger._id, status: 'initiated', energyDeliveredWh: 0, grossAmount: 0, accruedAmount: 0 });
      router.replace(`/session/${sessionId}`);
    } catch (err: any) {
      Alert.alert('Could not start session', err?.response?.data?.error ?? 'Try again');
    } finally {
      setStarting(false);
    }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#1a7f37" /></View>;
  if (!charger) return null;

  const canStart = charger.status === ChargerStatus.IDLE;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.address}>{charger.location.address || 'Unknown location'}</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Connector</Text>
        <Text style={styles.value}>{charger.connectorType}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Price</Text>
        <Text style={styles.value}>LKR {(charger.pricePerKwh / 100).toFixed(2)} / kWh</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Status</Text>
        <Text style={[styles.value, { color: canStart ? '#1a7f37' : '#ef4444' }]}>
          {charger.status.toUpperCase()}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.btn, !canStart && styles.btnDisabled]}
        onPress={handleStart}
        disabled={!canStart || starting}
      >
        {starting
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.btnText}>{canStart ? 'Start Charging' : 'Not Available'}</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, backgroundColor: '#fff', flexGrow: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  address: { fontSize: 20, fontWeight: '700', marginBottom: 24 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  label: { color: '#666', fontSize: 16 },
  value: { fontSize: 16, fontWeight: '600' },
  btn: { backgroundColor: '#1a7f37', borderRadius: 8, padding: 18, alignItems: 'center', marginTop: 32 },
  btnDisabled: { backgroundColor: '#d1d5db' },
  btnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});

import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { getMySessions, SessionData } from '../../src/services/api';

export default function SessionsScreen() {
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMySessions().catch(() => Alert.alert('Could not load sessions')).then((d) => d && setSessions(d)).finally(() => setLoading(false));
  }, []);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#0ea5e9" /></View>;

  return (
    <FlatList
      data={sessions}
      keyExtractor={(s) => s._id}
      contentContainerStyle={styles.list}
      ListEmptyComponent={<Text style={styles.empty}>No sessions yet</Text>}
      renderItem={({ item: s }) => (
        <View style={styles.card}>
          <Text style={styles.date}>{s.startTime ? new Date(s.startTime).toLocaleDateString() : 'Pending'}</Text>
          <View style={styles.row}><Text style={styles.label}>Energy</Text><Text style={styles.value}>{(s.energyDeliveredWh / 1000).toFixed(2)} kWh</Text></View>
          <View style={styles.row}><Text style={styles.label}>Your earnings</Text><Text style={styles.value}>LKR {(s.ownerPayoutAmount / 100).toFixed(2)}</Text></View>
          <Text style={[styles.status, s.status === 'completed' ? styles.done : styles.pending]}>{s.status.toUpperCase()}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 64 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12 },
  date: { fontWeight: '700', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  label: { color: '#666' },
  value: { fontWeight: '600' },
  status: { marginTop: 8, fontSize: 12, fontWeight: '700' },
  done: { color: '#1a7f37' },
  pending: { color: '#f59e0b' },
});

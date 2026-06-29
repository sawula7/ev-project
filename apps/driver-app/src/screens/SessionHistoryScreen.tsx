import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { listSessions, SessionData } from '../services/api';

export default function SessionHistoryScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listSessions()
      .then(setSessions)
      .catch(() => Alert.alert('Could not load sessions'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#1a7f37" /></View>;

  return (
    <FlatList
      data={sessions}
      keyExtractor={(s) => s._id}
      contentContainerStyle={styles.list}
      ListEmptyComponent={<Text style={styles.empty}>No sessions yet</Text>}
      renderItem={({ item: s }) => (
        <TouchableOpacity style={styles.card} onPress={() => router.push(`/session/${s._id}`)}>
          <Text style={styles.date}>{s.startTime ? new Date(s.startTime).toLocaleDateString() : 'Pending'}</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Energy</Text>
            <Text style={styles.value}>{(s.energyDeliveredWh / 1000).toFixed(2)} kWh</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Cost</Text>
            <Text style={styles.value}>LKR {(s.grossAmount / 100).toFixed(2)}</Text>
          </View>
          <Text style={[styles.status, s.status === 'completed' ? styles.done : styles.pending]}>
            {s.status.toUpperCase()}
          </Text>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 64, fontSize: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  date: { fontWeight: '700', fontSize: 15, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  label: { color: '#666' },
  value: { fontWeight: '600' },
  status: { marginTop: 8, fontSize: 12, fontWeight: '700' },
  done: { color: '#1a7f37' },
  pending: { color: '#f59e0b' },
});

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { getMe, getMyChargers, ChargerData } from '../services/api';
import { ChargerStatus } from '@ev/shared';

const STATUS_COLOR: Record<string, string> = {
  [ChargerStatus.IDLE]: '#1a7f37',
  [ChargerStatus.CHARGING]: '#f59e0b',
  [ChargerStatus.FAULTED]: '#ef4444',
  [ChargerStatus.OFFLINE]: '#9ca3af',
  [ChargerStatus.UNCLAIMED]: '#6b7280',
};

export default function DashboardScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [currency, setCurrency] = useState('LKR');
  const [chargers, setChargers] = useState<ChargerData[]>([]);
  const [ownerName, setOwnerName] = useState('');

  useEffect(() => {
    Promise.all([getMe(), getMyChargers()])
      .then(([me, ch]) => {
        setOwnerName(me.owner.name);
        setBalance(me.wallet.balance);
        setCurrency(me.wallet.currency);
        setChargers(ch);
      })
      .catch(() => Alert.alert('Could not load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#1a7f37" /></View>;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.greeting}>Hello, {ownerName}</Text>

      <View style={styles.walletCard}>
        <Text style={styles.walletLabel}>Wallet balance</Text>
        <Text style={styles.walletBalance}>{currency} {(balance / 100).toFixed(2)}</Text>
        <TouchableOpacity style={styles.payoutBtn} onPress={() => router.push('/payouts')}>
          <Text style={styles.payoutBtnText}>Request Payout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Chargers</Text>
          <TouchableOpacity onPress={() => router.push('/claim')}>
            <Text style={styles.addBtn}>+ Claim</Text>
          </TouchableOpacity>
        </View>
        {chargers.length === 0 && <Text style={styles.empty}>No chargers yet — claim one to get started</Text>}
        {chargers.map((c) => (
          <TouchableOpacity key={c._id} style={styles.chargerCard} onPress={() => router.push(`/charger/${c._id}`)}>
            <View>
              <Text style={styles.chargerSerial}>{c.serialNumber}</Text>
              <Text style={styles.chargerAddress}>{c.location.address || 'No address set'}</Text>
            </View>
            <Text style={[styles.chargerStatus, { color: STATUS_COLOR[c.status] ?? '#666' }]}>
              {c.status.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  greeting: { fontSize: 22, fontWeight: '700', marginBottom: 20 },
  walletCard: { backgroundColor: '#1a7f37', borderRadius: 16, padding: 24, marginBottom: 24 },
  walletLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  walletBalance: { color: '#fff', fontSize: 36, fontWeight: '800', marginVertical: 8 },
  payoutBtn: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, padding: 10, alignItems: 'center', marginTop: 8 },
  payoutBtnText: { color: '#fff', fontWeight: '600' },
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  addBtn: { color: '#1a7f37', fontWeight: '600', fontSize: 16 },
  chargerCard: { backgroundColor: '#fff', borderRadius: 10, padding: 16, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chargerSerial: { fontWeight: '700', fontSize: 15 },
  chargerAddress: { color: '#666', fontSize: 13, marginTop: 2 },
  chargerStatus: { fontSize: 12, fontWeight: '700' },
  empty: { color: '#9ca3af', textAlign: 'center', paddingVertical: 24 },
});

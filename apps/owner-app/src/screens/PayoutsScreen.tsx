import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, TextInput, ActivityIndicator } from 'react-native';
import { getMyPayouts, requestPayout, getMe, PayoutData } from '../services/api';

export default function PayoutsScreen() {
  const [payouts, setPayouts] = useState<PayoutData[]>([]);
  const [balance, setBalance] = useState(0);
  const [currency, setCurrency] = useState('LKR');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);

  async function load() {
    const [me, ps] = await Promise.all([getMe(), getMyPayouts()]);
    setBalance(me.wallet.balance);
    setCurrency(me.wallet.currency);
    setPayouts(ps);
  }

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  async function handleRequest() {
    const amt = parseInt(amount, 10);
    if (isNaN(amt) || amt <= 0) { Alert.alert('Enter a valid amount'); return; }
    if (amt > balance) { Alert.alert('Insufficient balance'); return; }
    setRequesting(true);
    try {
      await requestPayout(amt);
      Alert.alert('Payout requested', 'Admin will process it within 1–3 business days');
      setAmount('');
      await load();
    } catch (err: any) {
      Alert.alert('Failed', err?.response?.data?.error ?? 'Try again');
    } finally {
      setRequesting(false);
    }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#1a7f37" /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Available to payout</Text>
        <Text style={styles.balanceValue}>{currency} {(balance / 100).toFixed(2)}</Text>
      </View>

      <View style={styles.requestBox}>
        <TextInput style={styles.input} placeholder="Amount (smallest unit)" value={amount}
          onChangeText={setAmount} keyboardType="numeric" />
        <TouchableOpacity style={styles.btn} onPress={handleRequest} disabled={requesting}>
          {requesting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Request Payout</Text>}
        </TouchableOpacity>
      </View>

      <Text style={styles.historyTitle}>Payout History</Text>
      <FlatList
        data={payouts}
        keyExtractor={(p) => p._id}
        ListEmptyComponent={<Text style={styles.empty}>No payouts yet</Text>}
        renderItem={({ item: p }) => (
          <View style={styles.payoutRow}>
            <View>
              <Text style={styles.payoutAmount}>{currency} {(p.requestedAmount / 100).toFixed(2)}</Text>
              <Text style={styles.payoutDate}>{new Date(p.createdAt).toLocaleDateString()}</Text>
            </View>
            <Text style={[styles.payoutStatus, p.status === 'completed' ? styles.done : styles.pending]}>
              {p.status.toUpperCase()}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  balanceCard: { backgroundColor: '#1a7f37', padding: 24, alignItems: 'center' },
  balanceLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  balanceValue: { color: '#fff', fontSize: 32, fontWeight: '800', marginTop: 4 },
  requestBox: { padding: 16, backgroundColor: '#fff', margin: 16, borderRadius: 12 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 10, fontSize: 16 },
  btn: { backgroundColor: '#1a7f37', borderRadius: 8, padding: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  historyTitle: { fontWeight: '700', fontSize: 16, paddingHorizontal: 16, marginBottom: 8 },
  empty: { textAlign: 'center', color: '#9ca3af', paddingVertical: 24 },
  payoutRow: { backgroundColor: '#fff', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  payoutAmount: { fontWeight: '700', fontSize: 15 },
  payoutDate: { color: '#666', fontSize: 13, marginTop: 2 },
  payoutStatus: { fontSize: 12, fontWeight: '700' },
  done: { color: '#1a7f37' },
  pending: { color: '#f59e0b' },
});

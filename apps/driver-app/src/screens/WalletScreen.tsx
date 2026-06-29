import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { getWallet } from '../services/api';
import { useWalletStore } from '../services/store';

export default function WalletScreen() {
  const { balance, currency, setWallet } = useWalletStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getWallet()
      .then(({ balance, currency }) => setWallet(balance, currency))
      .catch(() => Alert.alert('Could not load wallet'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#1a7f37" /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>Available balance</Text>
        <Text style={styles.balance}>{currency} {(balance / 100).toFixed(2)}</Text>
      </View>

      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          Top-up via card will be available once the payment gateway is configured.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#1a7f37', borderRadius: 16, padding: 32, alignItems: 'center', marginBottom: 24 },
  label: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginBottom: 8 },
  balance: { color: '#fff', fontSize: 40, fontWeight: '800' },
  notice: { backgroundColor: '#fef3c7', borderRadius: 8, padding: 16 },
  noticeText: { color: '#92400e', fontSize: 14 },
});

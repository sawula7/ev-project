import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { claimCharger } from '../services/api';

export default function ClaimChargerScreen() {
  const router = useRouter();
  const [serial, setSerial] = useState('');
  const [claimCode, setClaimCode] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleClaim() {
    if (!serial.trim() || claimCode.trim().length !== 8) {
      Alert.alert('Enter the serial number and the 8-character claim code from the unit');
      return;
    }
    setLoading(true);
    try {
      await claimCharger(serial.trim(), claimCode.trim().toUpperCase());
      Alert.alert('Charger claimed!', 'It will appear in your dashboard.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Claim failed', err?.response?.data?.error ?? 'Check the serial and code');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Claim a Charger</Text>
      <Text style={styles.hint}>Enter the serial number and claim code found on the label affixed to the unit.</Text>
      <TextInput style={styles.input} placeholder="Serial number (e.g. EVUNIT001)"
        value={serial} onChangeText={setSerial} autoCapitalize="characters" />
      <TextInput style={styles.input} placeholder="Claim code (8 characters)"
        value={claimCode} onChangeText={setClaimCode} autoCapitalize="characters" maxLength={8} />
      <TouchableOpacity style={styles.btn} onPress={handleClaim} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Claim Charger</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  hint: { color: '#666', marginBottom: 24, lineHeight: 20 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 14, marginBottom: 12, fontSize: 16 },
  btn: { backgroundColor: '#1a7f37', borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

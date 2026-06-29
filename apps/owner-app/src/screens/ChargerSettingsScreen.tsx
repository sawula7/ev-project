import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getMyChargers, updateCharger, ChargerData } from '../services/api';

export default function ChargerSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [charger, setCharger] = useState<ChargerData | null>(null);
  const [pricePerKwh, setPricePerKwh] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getMyChargers().then((list) => {
      const c = list.find((x) => x._id === id);
      if (c) {
        setCharger(c);
        setPricePerKwh(String(c.pricePerKwh));
        setAddress(c.location.address);
      }
    });
  }, [id]);

  async function handleSave() {
    const price = parseInt(pricePerKwh, 10);
    if (isNaN(price) || price < 0) { Alert.alert('Enter a valid price (integer, smallest unit)'); return; }
    setSaving(true);
    try {
      await updateCharger(id, {
        pricePerKwh: price,
        location: { lat: charger!.location.lat, lng: charger!.location.lng, address },
      });
      Alert.alert('Saved');
      router.back();
    } catch {
      Alert.alert('Could not save changes');
    } finally {
      setSaving(false);
    }
  }

  if (!charger) return <View style={styles.center}><ActivityIndicator size="large" color="#1a7f37" /></View>;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.serial}>{charger.serialNumber}</Text>
      <Text style={styles.label}>Price per kWh (smallest currency unit)</Text>
      <TextInput style={styles.input} value={pricePerKwh} onChangeText={setPricePerKwh} keyboardType="numeric" />
      <Text style={styles.label}>Address</Text>
      <TextInput style={styles.input} value={address} onChangeText={setAddress} />
      <TouchableOpacity style={styles.btn} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Save</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, backgroundColor: '#fff', flexGrow: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  serial: { fontSize: 20, fontWeight: '700', marginBottom: 24 },
  label: { color: '#666', marginBottom: 4, fontSize: 14 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 16 },
  btn: { backgroundColor: '#1a7f37', borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

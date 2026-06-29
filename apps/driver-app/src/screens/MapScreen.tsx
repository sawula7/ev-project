import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Alert, Text } from 'react-native';
import MapView, { Marker, Callout } from 'react-native-maps';
import { useRouter } from 'expo-router';
import { listChargers, ChargerData } from '../services/api';
import { ChargerStatus } from '@ev/shared';

const STATUS_COLOR: Record<string, string> = {
  [ChargerStatus.IDLE]: '#1a7f37',
  [ChargerStatus.CHARGING]: '#f59e0b',
  [ChargerStatus.FAULTED]: '#ef4444',
  [ChargerStatus.OFFLINE]: '#9ca3af',
};

export default function MapScreen() {
  const router = useRouter();
  const [chargers, setChargers] = useState<ChargerData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchChargers = useCallback(async () => {
    try {
      const data = await listChargers();
      setChargers(data);
    } catch {
      Alert.alert('Could not load chargers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchChargers(); }, [fetchChargers]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#1a7f37" /></View>;
  }

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{ latitude: 6.9271, longitude: 79.8612, latitudeDelta: 0.5, longitudeDelta: 0.5 }}
        showsUserLocation
      >
        {chargers.map((c) => (
          <Marker
            key={c._id}
            coordinate={{ latitude: c.location.lat, longitude: c.location.lng }}
            pinColor={STATUS_COLOR[c.status] ?? '#9ca3af'}
          >
            <Callout onPress={() => router.push(`/charger/${c._id}`)}>
              <View style={styles.callout}>
                <Text style={styles.calloutTitle}>{c.location.address || c.serialNumber}</Text>
                <Text style={styles.calloutSub}>{c.connectorType} · LKR {(c.pricePerKwh / 100).toFixed(2)}/kWh</Text>
                <Text style={[styles.calloutStatus, { color: STATUS_COLOR[c.status] }]}>
                  {c.status.toUpperCase()}
                </Text>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  callout: { width: 200, padding: 8 },
  calloutTitle: { fontWeight: '600', fontSize: 14 },
  calloutSub: { color: '#666', fontSize: 12, marginTop: 2 },
  calloutStatus: { fontSize: 12, fontWeight: '700', marginTop: 4 },
});

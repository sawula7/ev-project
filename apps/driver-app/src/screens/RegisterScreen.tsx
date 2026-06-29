import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { driverRegister } from '../services/api';
import { useAuthStore } from '../services/store';

export default function RegisterScreen() {
  const router = useRouter();
  const setToken = useAuthStore((s) => s.setToken);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (!name || !email || !password) { Alert.alert('Fill in all fields'); return; }
    if (password.length < 8) { Alert.alert('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      const { token } = await driverRegister(email, password, name);
      await setToken(token);
      router.replace('/(tabs)/map');
    } catch {
      Alert.alert('Registration failed', 'Email may already be in use');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create Account</Text>
      <TextInput style={styles.input} placeholder="Full name" value={name} onChangeText={setName} />
      <TextInput style={styles.input} placeholder="Email" value={email}
        onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <TextInput style={styles.input} placeholder="Password (min 8 chars)" value={password}
        onChangeText={setPassword} secureTextEntry />
      <TouchableOpacity style={styles.btn} onPress={handleRegister} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create account</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.link}>Already have an account? Log in</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '700', color: '#1a7f37', textAlign: 'center', marginBottom: 32 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 14, marginBottom: 12, fontSize: 16 },
  btn: { backgroundColor: '#1a7f37', borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { textAlign: 'center', color: '#1a7f37', marginTop: 16 },
});

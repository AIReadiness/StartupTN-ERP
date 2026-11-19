import React, { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { errorText } from './api';
import { API_URL } from './config';
import { useSession } from './auth';
import { Button, Notice, Text, colors, s } from './ui';

export function Login() {
  const { login } = useSession();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Wake the free server as soon as the sign-in screen opens, so by the time the email is typed it is usually ready.
  useEffect(() => { fetch(`${API_URL}/api/health`).catch(() => {}); }, []);

  async function go() {
    setBusy(true);
    setError('');
    try {
      await login(email);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={[s.screen, { justifyContent: 'center' }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.pad}>
        <Image source={require('../assets/startuptn-logo.png')} style={{ width: 200, height: 54, marginBottom: 6 }} resizeMode="contain" />
        <Text style={[s.muted, { marginBottom: 26 }]}>Staff portal</Text>
        <View style={{ backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 18 }}>
          <Text style={s.h1}>Sign in</Text>
          <Text style={[s.body, { marginVertical: 10 }]}>Use your StartupTN email.</Text>
          <TextInput style={s.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoCorrect={false} placeholder="name@startuptn.in" placeholderTextColor={colors.muted} />
          {error ? <Notice tone="error" text={error} /> : null}
          <Button title="Sign in" onPress={go} busy={busy} disabled={!email.includes('@')} />
          <Text style={[s.muted, { fontSize: 12 }]}>{busy ? 'Signing in. If the server was asleep this can take up to a minute. Please keep the app open.' : 'The first sign-in of the day can take up to a minute while the server wakes up.'}</Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

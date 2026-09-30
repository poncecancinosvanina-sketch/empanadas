import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowLeft, LockKeyhole, ShieldCheck } from 'lucide-react-native';
import { isSupabaseConfigured } from '../lib/supabase';

type Props = {
  onBack: () => void;
  onSignIn: (email: string, password: string) => Promise<void>;
};

export default function PartnerLogin({ onBack, onSignIn }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setErrorMessage('');
    setIsSubmitting(true);
    try {
      await onSignIn(email.trim(), password);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No pudimos validar la cuenta.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Volver a pedidos" style={styles.backButton}>
          <ArrowLeft size={18} color="#24463A" />
        </Pressable>
        <Text style={styles.topTitle}>Acceso de socios</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.content}>
        <View style={styles.brandMark}><LockKeyhole size={25} color="#fff" /></View>
        <Text style={styles.eyebrow}>AREA PRIVADA</Text>
        <Text style={styles.title}>Ingresar al administrador</Text>
        <Text style={styles.subtitle}>Usa la cuenta personal que te dio de alta el administrador del sistema.</Text>

        {!isSupabaseConfigured ? (
          <View style={styles.setupNotice}>
            <ShieldCheck size={20} color="#9B542F" />
            <View style={styles.noticeCopy}>
              <Text style={styles.noticeTitle}>Falta conectar el servicio de acceso</Text>
              <Text style={styles.noticeText}>Configura las variables EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY en .env y reinicia Expo.</Text>
            </View>
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={styles.label}>Correo del socio</Text>
            <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="socio@tuempanaderia.com" placeholderTextColor="#9BA9A0" style={styles.input} accessibilityLabel="Correo del socio" />
            <Text style={styles.label}>Contraseña</Text>
            <TextInput value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" placeholder="Tu contraseña" placeholderTextColor="#9BA9A0" style={styles.input} accessibilityLabel="Contraseña" onSubmitEditing={handleSubmit} />
            {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
            <Pressable onPress={handleSubmit} disabled={isSubmitting || !email.trim() || !password} style={[styles.submitButton, (isSubmitting || !email.trim() || !password) && styles.submitDisabled]}>
              {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Ingresar de forma segura</Text>}
            </Pressable>
            <Text style={styles.footnote}>Solo las cuentas asignadas al rol socio tienen acceso al panel.</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F6F4' },
  topBar: { minHeight: 58, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E7ECE8' },
  backButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: '#28493D', fontSize: 13, fontWeight: '800' },
  content: { width: '100%', maxWidth: 460, alignSelf: 'center', padding: 24, paddingTop: 48 },
  brandMark: { width: 54, height: 54, borderRadius: 17, backgroundColor: '#173E34', alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  eyebrow: { color: '#AF5C35', fontSize: 10, fontWeight: '900', marginBottom: 8 },
  title: { color: '#1D392E', fontSize: 27, fontWeight: '900', lineHeight: 34 },
  subtitle: { color: '#728078', fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: 22 },
  form: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5ECE7', borderRadius: 18, padding: 18 },
  label: { color: '#3B5146', fontSize: 11, fontWeight: '800', marginTop: 10, marginBottom: 7 },
  input: { height: 46, borderWidth: 1, borderColor: '#DFE8E2', borderRadius: 10, paddingHorizontal: 12, color: '#243D32', fontSize: 13, backgroundColor: '#FCFDFC', outlineStyle: 'none' as never },
  submitButton: { minHeight: 46, marginTop: 18, borderRadius: 11, backgroundColor: '#173E34', alignItems: 'center', justifyContent: 'center' },
  submitDisabled: { opacity: 0.48 },
  submitText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  errorText: { color: '#AA3D31', fontSize: 11, lineHeight: 16, marginTop: 9 },
  footnote: { color: '#829088', fontSize: 10, lineHeight: 15, marginTop: 14, textAlign: 'center' },
  setupNotice: { flexDirection: 'row', gap: 11, alignItems: 'flex-start', padding: 15, backgroundColor: '#FFF4EB', borderWidth: 1, borderColor: '#F2DECF', borderRadius: 14 },
  noticeCopy: { flex: 1 },
  noticeTitle: { color: '#773F27', fontSize: 12, fontWeight: '900', marginBottom: 5 },
  noticeText: { color: '#885C45', fontSize: 11, lineHeight: 17 },
});

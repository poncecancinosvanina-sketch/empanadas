import React, { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import BoxBuilder from '../components/BoxBuilder';
import InventoryAdmin from './InventoryAdmin';
import PartnerLogin from './PartnerLogin';
import { LogIn, LogOut, ShoppingBag } from 'lucide-react-native';
import { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export default function HomeScreen() {
  const [activeTab, setActiveTab] = useState<'orders' | 'admin' | 'login'>('orders');
  const [session, setSession] = useState<Session | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(isSupabaseConfigured);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    let isMounted = true;
    const validateSession = async (nextSession: Session | null) => {
      if (!isMounted) return;
      setSession(nextSession);
      if (!nextSession) {
        setIsOwner(false);
        setIsCheckingSession(false);
        return;
      }

      setIsCheckingSession(true);
      const { data, error } = await client
        .from('partner_profiles')
        .select('role')
        .eq('user_id', nextSession.user.id)
        .maybeSingle();

      if (!isMounted) return;
      const owner = !error && data?.role === 'owner';
      setIsOwner(owner);
      setIsCheckingSession(false);
      if (!owner) await client.auth.signOut();
    };

    client.auth.getSession().then(({ data }) => validateSession(data.session));
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      void validateSession(nextSession);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handlePartnerSignIn = async (email: string, password: string) => {
    if (!supabase) throw new Error('El acceso de socios todavía no está configurado.');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new Error(error?.message ?? 'No se pudo iniciar la sesión.');

    const { data: profile, error: profileError } = await supabase
      .from('partner_profiles')
      .select('role')
      .eq('user_id', data.user.id)
      .maybeSingle();

    if (profileError || profile?.role !== 'owner') {
      await supabase.auth.signOut();
      throw new Error('Esta cuenta no tiene permisos de socio.');
    }

    setSession(data.session);
    setIsOwner(true);
    setActiveTab('admin');
  };

  const handleSignOut = async () => {
    await supabase?.auth.signOut();
    setSession(null);
    setIsOwner(false);
    setActiveTab('orders');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.navigation}>
        <Pressable onPress={() => setActiveTab('orders')} style={[styles.navItem, activeTab === 'orders' && styles.navItemActive]} accessibilityRole="button">
          <ShoppingBag size={17} color={activeTab === 'orders' ? '#fff' : '#426052'} />
          <Text style={[styles.navText, activeTab === 'orders' && styles.navTextActive]}>Pedidos</Text>
        </Pressable>
        {isOwner && <Pressable onPress={() => setActiveTab('admin')} style={[styles.navItem, activeTab === 'admin' && styles.navItemActive]}>
          <Text style={[styles.navText, styles.navTextActive]}>Administración</Text>
        </Pressable>}
        {isOwner ? (
          <Pressable onPress={handleSignOut} style={styles.sessionButton} accessibilityRole="button" accessibilityLabel="Cerrar sesión">
            <LogOut size={16} color="#426052" />
          </Pressable>
        ) : (
          <Pressable onPress={() => setActiveTab('login')} style={[styles.navItem, activeTab === 'login' && styles.navItemActive]} accessibilityRole="button">
            <LogIn size={16} color={activeTab === 'login' ? '#fff' : '#426052'} />
            <Text style={[styles.navText, activeTab === 'login' && styles.navTextActive]}>{isCheckingSession ? 'Validando' : 'Socios'}</Text>
          </Pressable>
        )}
      </View>
      {activeTab === 'login' && !isOwner ? (
        <PartnerLogin onBack={() => setActiveTab('orders')} onSignIn={handlePartnerSignIn} />
      ) : activeTab === 'admin' && isOwner && session ? (
        <InventoryAdmin />
      ) : (
        <BoxBuilder />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F6F4',
  },
  navigation: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E7ECE8',
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 11,
  },
  navItemActive: {
    backgroundColor: '#173E34',
  },
  navText: {
    color: '#426052',
    fontSize: 12,
    fontWeight: '800',
  },
  navTextActive: {
    color: '#fff',
  },
  sessionButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: '#EFF4F0',
  },
});

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/constants/Colors';
import { useUserStore } from '../../src/store/userStore';
import { api } from '../../src/config/api';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, fetchProfile, logout } = useUserStore();
  const [loading, setLoading] = useState(false);
  const [interviews, setInterviews] = useState<any[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      try {
        await fetchProfile();
      } catch (error) {
        console.error("Profil alınamadı:", error);
      } finally {
        setLoading(false);
      }
    };
    if (!user) loadProfile();
  }, [user]);

  useEffect(() => {
    const fetchStats = async () => {
      setStatsLoading(true);
      try {
        const res = await api.get('/api/v1/interview/me');
        if (res.data) {
          setInterviews(res.data);
        }
      } catch (error) {
        console.error("Mülakat istatistikleri alınamadı:", error);
      } finally {
        setStatsLoading(false);
      }
    };
    fetchStats();
  }, []);

  const handleLogout = async () => {
    Alert.alert(
      "Çıkış Yap",
      "Hesabınızdan çıkış yapmak istediğinize emin misiniz?",
      [
        { text: "İptal", style: "cancel" },
        { 
          text: "Çıkış Yap", 
          style: "destructive",
          onPress: async () => {
            await logout();
            router.replace('/(auth)/login');
          }
        }
      ]
    );
  };

  const getInitials = (first?: string, last?: string) => {
    if (!first && !last) return "U";
    return `${first?.[0] || ''}${last?.[0] || ''}`.toUpperCase();
  };

  const formatDate = (str?: string) => {
    if (!str) return '-';
    try {
      return new Date(str).toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return str;
    }
  };

  const completedInterviews = interviews.filter((i: any) => i.status === 'completed');
  
  const avgScore = completedInterviews.length > 0
    ? Math.round(
        completedInterviews.reduce((acc: number, curr: any) => {
          const score = curr.average_score !== undefined
            ? curr.average_score
            : Math.round(
                ((curr.technical_score || 0) + (curr.confidence_score || 0) + (curr.vocabulary_score || 0)) / 3
              );
          return acc + (score || 0);
        }, 0) / completedInterviews.length
      )
    : 0;

  const lastInterviewDate = interviews.length > 0
    ? formatDate(interviews[0].created_at)
    : 'Henüz Yok';

  if (loading && !user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Colors.secondary} />
          <Text style={styles.loadingText}>Profil yükleniyor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Profilim</Text>
        </View>

        {/* Profil Kartı */}
        <View style={styles.profileCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>
              {getInitials(user?.user_metadata?.first_name, user?.user_metadata?.last_name)}
            </Text>
          </View>
          <Text style={styles.nameText}>
            {user?.user_metadata?.first_name || ''} {user?.user_metadata?.last_name || ''}
          </Text>
          <Text style={styles.emailText}>{user?.email}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{user?.user_metadata?.role === 'admin' ? 'Yönetici' : 'Aday'}</Text>
          </View>
        </View>

        {/* İstatistikler */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mülakat İstatistikleri</Text>
          {statsLoading ? (
            <View style={styles.statsLoader}>
              <ActivityIndicator size="small" color={Colors.secondary} />
            </View>
          ) : (
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <View style={[styles.statIconBox, { backgroundColor: 'rgba(0,104,122,0.08)' }]}>
                  <Ionicons name="document-text-outline" size={18} color={Colors.secondary} />
                </View>
                <Text style={styles.statVal}>{interviews.length}</Text>
                <Text style={styles.statLbl}>Mülakat</Text>
              </View>
              
              <View style={styles.statCard}>
                <View style={[styles.statIconBox, { backgroundColor: 'rgba(16,185,129,0.08)' }]}>
                  <Ionicons name="ribbon-outline" size={18} color={Colors.success} />
                </View>
                <Text style={styles.statVal}>%{avgScore}</Text>
                <Text style={styles.statLbl}>Ort. Başarı</Text>
              </View>

              <View style={styles.statCard}>
                <View style={[styles.statIconBox, { backgroundColor: 'rgba(245,158,11,0.08)' }]}>
                  <Ionicons name="calendar-outline" size={18} color={Colors.warning} />
                </View>
                <Text style={styles.statVal} numberOfLines={1} adjustsFontSizeToFit>{lastInterviewDate}</Text>
                <Text style={styles.statLbl}>Son Katılım</Text>
              </View>
            </View>
          )}
        </View>

        {/* Kişisel Bilgiler */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Kişisel Bilgiler</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Ad</Text>
            <View style={styles.inputBox}>
              <Text style={styles.inputText}>{user?.user_metadata?.first_name || '-'}</Text>
            </View>
          </View>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Soyad</Text>
            <View style={styles.inputBox}>
              <Text style={styles.inputText}>{user?.user_metadata?.last_name || '-'}</Text>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Hedef Pozisyon</Text>
            <View style={styles.inputBox}>
              <Text style={styles.inputText}>{user?.user_metadata?.target || '-'}</Text>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>E-posta Adresi</Text>
            <View style={styles.inputBox}>
              <Text style={styles.inputText}>{user?.email || '-'}</Text>
            </View>
          </View>
        </View>

        {/* Hesap Bilgileri */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hesap Bilgileri</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Kayıt Tarihi</Text>
            <View style={styles.inputBox}>
              <Text style={styles.inputText}>{formatDate(user?.created_at)}</Text>
            </View>
          </View>
        </View>

        {/* Ayarlar & Çıkış */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hesap Ayarları</Text>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.85}>
            <Ionicons name="log-out-outline" size={20} color={Colors.error} />
            <Text style={styles.logoutText}>Çıkış Yap</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: Colors.onSurfaceVariant, fontSize: 14 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 50 },
  header: { marginBottom: 24 },
  title: { fontSize: 32, fontWeight: '800', color: Colors.onSurface, letterSpacing: -0.5 },
  
  profileCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 24,
    padding: 30,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0,104,122,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: { fontSize: 28, fontWeight: '800', color: Colors.secondary },
  nameText: { fontSize: 22, fontWeight: '800', color: Colors.onSurface, marginBottom: 4 },
  emailText: { fontSize: 14, color: Colors.onSurfaceVariant, marginBottom: 12 },
  roleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,104,122,0.08)',
    borderRadius: 12,
  },
  roleText: { fontSize: 12, fontWeight: '700', color: Colors.secondary, textTransform: 'uppercase' },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.onSurface, marginBottom: 12 },
  
  statsLoader: {
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  statIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statVal: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.onSurface,
    marginBottom: 2,
    textAlign: 'center',
  },
  statLbl: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
  },

  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.onSurfaceVariant, marginBottom: 8, marginLeft: 4 },
  inputBox: {
    backgroundColor: Colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  inputText: { fontSize: 15, color: Colors.onSurface, fontWeight: '500' },

  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(186,26,26,0.1)',
    marginTop: 8,
  },
  logoutText: { fontSize: 16, fontWeight: '700', color: Colors.error },
});

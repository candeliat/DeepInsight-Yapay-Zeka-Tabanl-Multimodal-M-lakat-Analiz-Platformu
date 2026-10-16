import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../src/constants/Colors';
import { FontFamilies } from '../src/constants/Fonts';
import { AppNotification, NotificationKind, notificationService } from '../src/services/orgService';
import { Banner, EmptyState, Loading, SectionTitle, Screen, typo } from '../src/components/ui';

const KIND_ICON: Record<NotificationKind, keyof typeof Ionicons.glyphMap> = {
  assignment_new: 'clipboard-outline',
  assignment_due_soon: 'calendar-outline',
  assignment_overdue: 'alarm-outline',
  assignment_reminder: 'megaphone-outline',
};

function timeAgo(iso: string | null) {
  if (!iso) return '';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'şimdi';
  if (minutes < 60) return `${minutes} dk önce`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} sa önce`;
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await notificationService.mine();
      setItems(data.items);
      setUnread(data.unread_count);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bildirimler yüklenemedi.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markAll = async () => {
    try {
      await notificationService.markRead();
      const now = new Date().toISOString();
      setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? now })));
      setUnread(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'İşaretlenemedi.');
    }
  };

  const open = (n: AppNotification) => {
    if (!n.read_at) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      setUnread((u) => Math.max(0, u - 1));
      notificationService.markRead([n.id]).catch(() => undefined);
    }
    if (n.assignment_id || n.link === '/assignments') router.push('/assignments');
  };

  return (
    <Screen
      title="Bildirimler"
      subtitle="Yeni ödevler, yaklaşan son tarihler ve eğitmen hatırlatmaları."
      icon="notifications-outline"
      onRefresh={() => {
        setRefreshing(true);
        load();
      }}
      refreshing={refreshing}
    >
      {error && <Banner>{error}</Banner>}
      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <EmptyState icon="notifications-off-outline" text="Bildiriminiz yok." />
      ) : (
        <>
          <SectionTitle
            right={
              unread > 0 ? (
                <TouchableOpacity onPress={markAll} accessibilityRole="button" hitSlop={8}>
                  <Text style={styles.markAll}>Tümünü okundu say</Text>
                </TouchableOpacity>
              ) : undefined
            }
          >
            {unread > 0 ? `${unread} okunmamış` : 'Tümü okundu'}
          </SectionTitle>
          {items.map((n) => {
            const urgent = n.kind === 'assignment_overdue' || n.kind === 'assignment_due_soon';
            return (
              <TouchableOpacity
                key={n.id}
                style={[styles.item, !n.read_at && styles.unread]}
                onPress={() => open(n)}
                accessibilityRole="button"
                accessibilityLabel={`${n.title}${n.read_at ? '' : ', okunmadı'}`}
                activeOpacity={0.8}
              >
                <Ionicons name={KIND_ICON[n.kind] ?? 'notifications-outline'} size={20} color={urgent ? Colors.warning : Colors.secondary} />
                <View style={{ flex: 1 }}>
                  <Text style={[typo.bodyStrong, n.read_at && { fontFamily: FontFamilies.sansRegular }]}>{n.title}</Text>
                  {n.body && <Text style={[typo.small, { marginTop: 2 }]}>{n.body}</Text>}
                  <Text style={[typo.small, { marginTop: 4, fontSize: 11 }]}>{timeAgo(n.created_at)}</Text>
                </View>
                {!n.read_at && <View style={styles.dot} />}
              </TouchableOpacity>
            );
          })}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: 16, padding: 14, marginBottom: 10,
  },
  unread: { backgroundColor: Colors.surfaceContainerLow },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.secondary, marginTop: 6 },
  markAll: { fontSize: 12, fontFamily: FontFamilies.sansSemibold, color: Colors.secondary },
});

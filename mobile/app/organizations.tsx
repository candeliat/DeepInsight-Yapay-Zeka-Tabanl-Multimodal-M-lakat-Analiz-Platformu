import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../src/constants/Colors';
import { FontFamilies } from '../src/constants/Fonts';
import { MyInvite, MyOrganization, ROLE_LABEL, orgService } from '../src/services/orgService';
import { Banner, Card, Chip, EmptyState, Loading, PrimaryButton, Screen, SectionTitle, typo } from '../src/components/ui';

export default function OrganizationsScreen() {
  const [orgs, setOrgs] = useState<MyOrganization[]>([]);
  const [invites, setInvites] = useState<MyInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [mine, pending] = await Promise.all([orgService.myOrganizations(), orgService.myInvites()]);
      setOrgs(mine);
      setInvites(pending);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (key: string, action: () => Promise<string | void>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const msg = await action();
      if (msg) setNotice(msg);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'İşlem yapılamadı.');
    } finally {
      setBusy(null);
    }
  };

  const join = () =>
    run('join', async () => {
      const org = await orgService.join(code.trim());
      setCode('');
      return `"${org.name}" kurumuna katıldınız.`;
    });

  const respond = (inv: MyInvite, accept: boolean) =>
    run(`inv-${inv.id}`, async () => {
      await orgService.respondInvite(inv.id, accept);
      return accept ? `"${inv.org_name ?? 'Kurum'}" kurumuna katıldınız.` : 'Davet reddedildi.';
    });

  const toggleSharing = async (org: MyOrganization) => {
    setBusy(`share-${org.id}`);
    setError(null);
    try {
      const { share_progress } = await orgService.setSharing(org.id, !org.share_progress);
      setOrgs((prev) => prev.map((o) => (o.id === org.id ? { ...o, share_progress } : o)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Güncellenemedi.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen
      title="Kurumlarım"
      subtitle="Üniversite kariyer merkezi, bootcamp gibi kurumlara katılın; neyi paylaşacağınızı siz seçin."
      icon="business-outline"
      onRefresh={() => {
        setRefreshing(true);
        load();
      }}
      refreshing={refreshing}
    >
      {error && <Banner>{error}</Banner>}
      {notice && <Banner kind="success">{notice}</Banner>}

      {invites.map((inv) => (
        <Card key={inv.id} style={styles.invite}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Ionicons name="mail-open-outline" size={20} color={Colors.secondary} />
            <View style={{ flex: 1 }}>
              <Text style={typo.bodyStrong}>
                {inv.org_name ?? 'Bir kurum'} sizi {ROLE_LABEL[inv.role].toLocaleLowerCase('tr')} olarak davet etti
              </Text>
              <Text style={[typo.small, { marginTop: 4 }]}>
                Kabul ederseniz kurum adına yaptığınız mülakatlara katılımınızı eğitmenler görür; skor paylaşımı ayrıca sizin izninize bağlıdır.
              </Text>
            </View>
          </View>
          <View style={styles.row}>
            <PrimaryButton title="Kabul et" icon="checkmark" onPress={() => respond(inv, true)} loading={busy === `inv-${inv.id}`} style={{ flex: 1 }} />
            <PrimaryButton title="Reddet" variant="outline" onPress={() => respond(inv, false)} disabled={busy === `inv-${inv.id}`} style={{ flex: 1 }} />
          </View>
        </Card>
      ))}

      <Card>
        <Text style={typo.label}>DAVET KODU</Text>
        <View style={[styles.row, { alignItems: 'center' }]}>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="Kurumunuzun verdiği kod"
            placeholderTextColor={Colors.outline}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={64}
            style={styles.input}
            accessibilityLabel="Davet kodu"
          />
          <PrimaryButton title="Katıl" onPress={join} loading={busy === 'join'} disabled={!code.trim()} />
        </View>
      </Card>

      <SectionTitle>Üyeliklerim ({orgs.length})</SectionTitle>
      {loading ? (
        <Loading />
      ) : orgs.length === 0 ? (
        <EmptyState icon="business-outline" text="Henüz bir kuruma üye değilsiniz." />
      ) : (
        orgs.map((org) => (
          <Card key={org.id}>
            <Text style={typo.cardTitle}>{org.name}</Text>
            <View style={{ marginTop: 6 }}>
              <Chip tone="brand" label={ROLE_LABEL[org.role]} />
            </View>
            {org.role === 'candidate' ? (
              <View style={styles.share}>
                <View style={{ flex: 1 }}>
                  <Text style={typo.bodyStrong}>İlerlememi eğitmenlerle paylaş</Text>
                  <Text style={[typo.small, { marginTop: 4 }]}>
                    Kapalıyken eğitmenler yalnızca kurum adına kaç mülakat yaptığınızı görür; skorlarınız yalnızca en az 3 öğrencilik toplu
                    istatistiklere katılır. Bireysel mülakatlarınız hiçbir durumda paylaşılmaz.
                  </Text>
                </View>
                <Switch
                  value={org.share_progress}
                  onValueChange={() => toggleSharing(org)}
                  disabled={busy === `share-${org.id}`}
                  trackColor={{ true: Colors.primary, false: Colors.outlineVariant }}
                  accessibilityLabel={`${org.name} ile ilerleme paylaşımı`}
                />
              </View>
            ) : (
              <Text style={[typo.small, { marginTop: 8 }]}>Kurum paneli masaüstünde (web) kullanılabilir.</Text>
            )}
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  invite: { backgroundColor: 'rgba(0,104,122,0.06)', borderColor: 'rgba(0,104,122,0.2)' },
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  input: {
    flex: 1, backgroundColor: Colors.surfaceContainerLow, borderWidth: 1, borderColor: Colors.outlineVariant, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, fontFamily: FontFamilies.sansRegular, color: Colors.onSurface,
  },
  share: { flexDirection: 'row', gap: 12, alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' },
});

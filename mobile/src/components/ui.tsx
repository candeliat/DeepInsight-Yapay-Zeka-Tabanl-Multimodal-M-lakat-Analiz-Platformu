/**
 * Kariyer ekranlarının (CV, ilanlar, gelişim, kurumlar, ödevler, pilot) ortak yapı
 * taşları. Renk ve yazı tipleri dashboard ile aynı tasarım sisteminden gelir.
 */
import React from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { Colors } from '../constants/Colors';
import { FontFamilies } from '../constants/Fonts';

type IconName = keyof typeof Ionicons.glyphMap;

export function Screen({
  title,
  subtitle,
  icon,
  children,
  onRefresh,
  refreshing = false,
  back = true,
  footer,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  children: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  back?: boolean;
  footer?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      {back && (
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} accessibilityLabel="Geri" hitSlop={10}>
            <Ionicons name="chevron-back" size={22} color={Colors.onSurface} />
          </TouchableOpacity>
        </View>
      )}
      <ScrollView
        contentContainerStyle={[s.content, !back && { paddingTop: 40 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.secondary} /> : undefined}
      >
        <View style={s.header}>
          {icon && (
            <View style={s.headerIcon}>
              <Ionicons name={icon} size={22} color={Colors.secondary} />
            </View>
          )}
          <Text style={s.title}>{title}</Text>
          {subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
        </View>
        {children}
        <View style={{ height: footer ? 110 : 40 }} />
      </ScrollView>
      {footer && <View style={s.footer}>{footer}</View>}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  // textTransform: 'uppercase' Türkçe "i -> İ" kuralını bilmez ("PROFIL"); yerel ayarla çevrilir.
  const label = typeof children === 'string' ? children.toLocaleUpperCase('tr-TR') : children;
  return (
    <View style={s.sectionRow}>
      <Text style={s.sectionTitle}>{label}</Text>
      {right}
    </View>
  );
}

export function Banner({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info' | 'warning'; children: React.ReactNode }) {
  const tone = {
    error: { bg: 'rgba(186,26,26,0.08)', fg: Colors.error, icon: 'alert-circle' as IconName },
    success: { bg: 'rgba(16,185,129,0.1)', fg: '#047857', icon: 'checkmark-circle' as IconName },
    info: { bg: 'rgba(0,104,122,0.07)', fg: Colors.secondary, icon: 'information-circle' as IconName },
    warning: { bg: 'rgba(245,158,11,0.12)', fg: '#92400e', icon: 'warning' as IconName },
  }[kind];
  return (
    <View style={[s.banner, { backgroundColor: tone.bg }]} accessibilityRole={kind === 'error' ? 'alert' : undefined}>
      <Ionicons name={tone.icon} size={18} color={tone.fg} />
      <Text style={[s.bannerText, { color: tone.fg }]}>{children}</Text>
    </View>
  );
}

export function Chip({ label, tone = 'neutral', icon }: { label: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'brand'; icon?: IconName }) {
  const c = {
    neutral: { bg: Colors.surfaceContainerLow, fg: Colors.onSurfaceVariant },
    brand: { bg: 'rgba(0,104,122,0.1)', fg: Colors.secondary },
    good: { bg: 'rgba(16,185,129,0.12)', fg: '#047857' },
    warn: { bg: 'rgba(245,158,11,0.15)', fg: '#92400e' },
    bad: { bg: 'rgba(186,26,26,0.1)', fg: Colors.error },
  }[tone];
  return (
    <View style={[s.chip, { backgroundColor: c.bg }]}>
      {icon && <Ionicons name={icon} size={12} color={c.fg} />}
      <Text style={[s.chipText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={s.loading}>
      <ActivityIndicator size="large" color={Colors.secondary} />
    </View>
  );
}

export function EmptyState({ icon, text, action }: { icon: IconName; text: string; action?: React.ReactNode }) {
  return (
    <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
      <Ionicons name={icon} size={34} color={Colors.outlineVariant} />
      <Text style={s.emptyText}>{text}</Text>
      {action}
    </Card>
  );
}

/** Skor halkası (0-100). Değer yazıyla da verilir; renk tek başına anlam taşımaz. */
export function ScoreRing({ value, size = 112, label }: { value: number; size?: number; label?: string }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  const color = clamped >= 75 ? Colors.success : clamped >= 50 ? Colors.warning : Colors.error;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`${label ?? 'Skor'}: ${Math.round(clamped)} / 100`}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={Colors.surfaceContainerHigh} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={s.ringValue}>{Math.round(clamped)}</Text>
      {label && <Text style={s.ringLabel}>{label}</Text>}
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  icon,
  loading,
  disabled,
  variant = 'primary',
  style,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'outline' | 'danger';
  style?: ViewStyle;
}) {
  const bg = variant === 'primary' ? Colors.primary : variant === 'danger' ? Colors.error : 'transparent';
  const fg = variant === 'outline' ? Colors.secondary : '#fff';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading) }}
      style={[
        s.btn,
        { backgroundColor: bg, borderWidth: variant === 'outline' ? 1.5 : 0, borderColor: Colors.secondary },
        (disabled || loading) && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} size="small" /> : icon ? <Ionicons name={icon} size={17} color={fg} /> : null}
      <Text style={[s.btnText, { color: fg }]}>{title}</Text>
    </TouchableOpacity>
  );
}

const LIKERT = ['Kesinlikle katılmıyorum', 'Katılmıyorum', 'Kararsızım', 'Katılıyorum', 'Kesinlikle katılıyorum'];

export function LikertRow({ label, value, onChange }: { label: string; value?: number; onChange: (v: number) => void }) {
  return (
    <View style={s.likert}>
      <Text style={s.likertLabel}>{label}</Text>
      <View style={s.likertRow}>
        {[1, 2, 3, 4, 5].map((n) => (
          <TouchableOpacity
            key={n}
            onPress={() => onChange(n)}
            accessibilityRole="radio"
            accessibilityState={{ checked: value === n }}
            accessibilityLabel={`${n} — ${LIKERT[n - 1]}`}
            style={[s.likertBtn, value === n && s.likertBtnOn]}
          >
            <Text style={[s.likertNum, value === n && { color: '#fff' }]}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={s.likertEnds}>
        <Text style={s.likertEnd}>Katılmıyorum</Text>
        <Text style={s.likertEnd}>Katılıyorum</Text>
      </View>
    </View>
  );
}

export const typo = StyleSheet.create({
  body: { fontSize: 14, fontFamily: FontFamilies.sansRegular, color: Colors.onSurfaceVariant, lineHeight: 21 },
  bodyStrong: { fontSize: 14, fontFamily: FontFamilies.sansSemibold, color: Colors.onSurface },
  small: { fontSize: 12, fontFamily: FontFamilies.sansRegular, color: Colors.onSurfaceVariant, lineHeight: 17 },
  label: { fontSize: 10, fontFamily: FontFamilies.sansBold, color: Colors.onSurfaceVariant, letterSpacing: 0.8 },
  cardTitle: { fontSize: 16, fontFamily: FontFamilies.sansBold, color: Colors.onSurface },
});

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  topBar: { paddingHorizontal: 12, paddingTop: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 4 },
  header: { marginBottom: 18 },
  headerIcon: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(0,104,122,0.1)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  title: { fontSize: 28, fontFamily: FontFamilies.displaySemiboldItalic, color: Colors.onSurface, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, fontFamily: FontFamilies.sansRegular, color: Colors.onSurfaceVariant, marginTop: 6, lineHeight: 21 },
  card: {
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: 18, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, marginBottom: 10 },
  sectionTitle: { fontSize: 12, fontFamily: FontFamilies.sansBold, color: Colors.onSurfaceVariant, letterSpacing: 0.8 },
  banner: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, borderRadius: 14, marginBottom: 12 },
  bannerText: { flex: 1, fontSize: 13, fontFamily: FontFamilies.sansSemibold, lineHeight: 19 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start' },
  chipText: { fontSize: 11, fontFamily: FontFamilies.sansBold },
  loading: { paddingVertical: 60, alignItems: 'center' },
  emptyText: { fontSize: 14, fontFamily: FontFamilies.sansRegular, color: Colors.onSurfaceVariant, textAlign: 'center', marginTop: 10, marginBottom: 6 },
  ringValue: { fontSize: 30, fontFamily: FontFamilies.sansExtrabold, color: Colors.onSurface },
  ringLabel: { fontSize: 10, fontFamily: FontFamilies.sansBold, color: Colors.onSurfaceVariant, letterSpacing: 0.5 },
  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 26,
    backgroundColor: 'rgba(248,249,255,0.96)', borderTopWidth: 1, borderTopColor: Colors.outlineVariant,
  },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, paddingHorizontal: 18, borderRadius: 14 },
  btnText: { fontSize: 14, fontFamily: FontFamilies.sansBold },
  likert: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  likertLabel: { fontSize: 14, fontFamily: FontFamilies.sansMedium, color: Colors.onSurface, marginBottom: 8, lineHeight: 20 },
  likertRow: { flexDirection: 'row', gap: 8 },
  likertBtn: {
    flex: 1, height: 42, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.outlineVariant,
    alignItems: 'center', justifyContent: 'center',
  },
  likertBtnOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  likertNum: { fontSize: 15, fontFamily: FontFamilies.sansBold, color: Colors.onSurfaceVariant },
  likertEnds: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  likertEnd: { fontSize: 10, fontFamily: FontFamilies.sansRegular, color: Colors.outline },
});

// src/constants/Colors.ts
// IntervAI Tasarım Sistemi - Material Design 3 Renk Paleti

export const Colors = {
  // Ana Renkler
  primary: '#000000',        // Siyah (Ana aksiyon butonu)
  onPrimary: '#ffffff',      // Buton üzeri yazı

  // İkincil Renkler (Teal/Cyan)
  secondary: '#00687a',
  onSecondary: '#ffffff',
  secondaryContainer: '#57dffe',
  onSecondaryContainer: '#006172',

  // Arka Plan & Yüzeyler
  background: '#f8f9ff',
  surface: '#f8f9ff',
  surfaceContainer: '#e5eeff',
  surfaceContainerLow: '#eff4ff',
  surfaceContainerHigh: '#dce9ff',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerHighest: '#d3e4fe',

  // Metin Renkleri
  onSurface: '#0b1c30',
  onSurfaceVariant: '#45464d',
  onBackground: '#0b1c30',
  onPrimaryFixed: '#131b2e',

  // Kenarlık & Anahat
  outline: '#76777d',
  outlineVariant: '#c6c6cd',

  // Durum Renkleri
  error: '#ba1a1a',
  success: '#10b981',
  warning: '#f59e0b',

  // Özel
  inverseOnSurface: '#eaf1ff',
  inverseSurface: '#213145',

  // Legacy uyumluluk (eski bileşenler için)
  text: '#0b1c30',
  textLight: '#45464d',
  border: '#c6c6cd',
  danger: '#ba1a1a',
};

export type ColorTheme = typeof Colors;

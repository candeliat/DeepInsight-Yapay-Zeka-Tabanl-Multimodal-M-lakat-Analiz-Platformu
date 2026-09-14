// src/constants/Typography.ts
// IntervAI Tipografi Sistemi
import { FontFamilies } from './Fonts';

export const Typography = {
  h1: {
    fontSize: 36,
    fontFamily: FontFamilies.displaySemibold,
    lineHeight: 43,
    letterSpacing: -0.3,
  },
  h2: {
    fontSize: 28,
    fontFamily: FontFamilies.displaySemibold,
    lineHeight: 36,
    letterSpacing: -0.2,
  },
  h3: {
    fontSize: 22,
    fontFamily: FontFamilies.sansSemibold,
    lineHeight: 30,
  },
  bodyLg: {
    fontSize: 17,
    fontFamily: FontFamilies.sansRegular,
    lineHeight: 26,
  },
  bodyMd: {
    fontSize: 15,
    fontFamily: FontFamilies.sansRegular,
    lineHeight: 22,
  },
  labelCaps: {
    fontSize: 11,
    fontFamily: FontFamilies.sansSemibold,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
  dataPoint: {
    fontSize: 13,
    fontFamily: FontFamilies.sansMedium,
    lineHeight: 18,
  },
};

// Dashboard'daki (Tailwind) rounded-lg/xl/2xl/3xl ile birebir eşleşen
// köşe yarıçapı ölçeği — iki platform aynı "yumuşaklık" hissini paylaşır.
export const Radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};

// src/constants/Fonts.ts
// İki sesli tipografi: Fraunces, YZ mülakatçının "konuştuğu" anlarda (sorular,
// karşılama/boş-durum metinleri) sıcak bir insan tonu taşır; Manrope arayüz
// kromunda (butonlar, skorlar, sekmeler) net ve ölçülü kalır. Dashboard'daki
// (Next.js) aynı iki Google Font ailesiyle birebir eşleşir — iki platform da
// gerçekten aynı font dosyalarını kullanır.

export {
  Fraunces_500Medium,
  Fraunces_600SemiBold,
  Fraunces_600SemiBold_Italic,
} from '@expo-google-fonts/fraunces';

export {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';

// StyleSheet'lerde kullanılacak fontFamily string sabitleri.
export const FontFamilies = {
  displayMedium: 'Fraunces_500Medium',
  displaySemibold: 'Fraunces_600SemiBold',
  displaySemiboldItalic: 'Fraunces_600SemiBold_Italic',
  sansRegular: 'Manrope_400Regular',
  sansMedium: 'Manrope_500Medium',
  sansSemibold: 'Manrope_600SemiBold',
  sansBold: 'Manrope_700Bold',
  sansExtrabold: 'Manrope_800ExtraBold',
} as const;

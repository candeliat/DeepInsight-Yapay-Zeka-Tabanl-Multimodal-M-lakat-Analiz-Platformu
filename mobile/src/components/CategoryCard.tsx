import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../constants/Colors';
import { Ionicons } from '@expo/vector-icons';

interface CategoryCardProps {
  id: string;
  title: string;
  description: string;
  iconName: keyof typeof Ionicons.glyphMap;
  isSelected: boolean;
  onPress: (id: string) => void;
}

/**
 * Adayların mülakat yapacağı alanı seçebileceği tıklanabilir şık kart bileşeni.
 * Seçildiğinde (isSelected) farklı bir stilde gösterilir.
 */
export const CategoryCard: React.FC<CategoryCardProps> = ({
  id,
  title,
  description,
  iconName,
  isSelected,
  onPress,
}) => {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={[
        styles.card,
        isSelected && styles.cardSelected // Seçiliyse ekstra kenarlık stili
      ]}
      onPress={() => onPress(id)}
    >
      <View style={[styles.iconContainer, isSelected && styles.iconContainerSelected]}>
        <Ionicons 
          name={iconName} 
          size={28} 
          color={isSelected ? Colors.surface : Colors.primary} 
        />
      </View>
      
      <View style={styles.textContainer}>
        <Text style={[styles.title, isSelected && styles.titleSelected]}>
          {title}
        </Text>
        <Text style={[styles.description, isSelected && styles.descriptionSelected]}>
          {description}
        </Text>
      </View>

      {/* Seçim İkonu/Göstergesi: Eğer seçiliyse Check göster, değilse boş bir çerçeve */}
      <View style={[styles.radioOutline, isSelected && styles.radioFilled]}>
        {isSelected && <Ionicons name="checkmark" size={14} color={Colors.surface} />}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16, // Kartlar arası boşluk
    borderWidth: 1.5,
    borderColor: Colors.border,
    shadowColor: Colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2, // Android gölgesi
  },
  cardSelected: {
    borderColor: Colors.primary, // Seçildiğinde kurumsal mavi kalın kenarlık
    backgroundColor: '#F0F7FF', // Çok açık mavi bir zemin tonu (isteğe bağlı)
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#E6F0F9', // Mavi tonuna uygun hafif arkaplan
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  iconContainerSelected: {
    backgroundColor: Colors.primary, // Seçildiğinde mavi arkaplan, ikon beyaz
  },
  textContainer: {
    flex: 1, // Kalan boşluğu doldur
    marginRight: 12, // Radyo butonuyla metin arası boşluk
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  titleSelected: {
    color: Colors.primary,
  },
  description: {
    fontSize: 13,
    color: Colors.textLight,
    lineHeight: 18,
  },
  descriptionSelected: {
    color: Colors.text,
  },
  radioOutline: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioFilled: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
});

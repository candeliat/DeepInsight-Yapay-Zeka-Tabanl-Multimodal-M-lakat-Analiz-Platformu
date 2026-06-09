import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const setStorageItemAsync = async (key: string, value: string) => {
  if (Platform.OS === 'web') {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
      }
    } catch {
      // localStorage web platformunda kullanılamıyorsa sessizce geç
    }
  } else {
    await SecureStore.setItemAsync(key, value);
  }
};

export const getStorageItemAsync = async (key: string) => {
  if (Platform.OS === 'web') {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(key);
      }
    } catch {
      // localStorage web platformunda kullanılamıyorsa sessizce geç
    }
    return null;
  } else {
    return await SecureStore.getItemAsync(key);
  }
};

export const deleteStorageItemAsync = async (key: string) => {
  if (Platform.OS === 'web') {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
      }
    } catch {
      // localStorage web platformunda kullanılamıyorsa sessizce geç
    }
  } else {
    await SecureStore.deleteItemAsync(key);
  }
};

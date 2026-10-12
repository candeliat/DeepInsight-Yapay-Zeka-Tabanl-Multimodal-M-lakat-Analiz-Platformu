import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { API_URL, refreshAccessToken } from '../config/api';
import { getStorageItemAsync } from './storage';

/**
 * Yetkili bir uç noktadan dosya indirir ve paylaşım sayfasını açar (kaydet, e-postayla
 * gönder, PDF görüntüleyici...). Düz bir bağlantı Authorization başlığı taşıyamadığı
 * için dosya önce uygulamanın önbelleğine indirilir. Web'de tarayıcı indirmesi yapılır.
 */
export async function downloadAndShare(path: string, filename: string, mimeType: string): Promise<void> {
  const url = `${API_URL}${path}`;
  let token = await getStorageItemAsync('token');

  if (Platform.OS === 'web') {
    let res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (res.status === 401 && (token = await refreshAccessToken().catch(() => null))) {
      res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    }
    if (!res.ok) throw new Error(`İndirilemedi (HTTP ${res.status}).`);
    const blobUrl = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    return;
  }

  const target = `${FileSystem.cacheDirectory}${filename}`;
  let result = await FileSystem.downloadAsync(url, target, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (result.status === 401 && (token = await refreshAccessToken().catch(() => null))) {
    result = await FileSystem.downloadAsync(url, target, { headers: { Authorization: `Bearer ${token}` } });
  }
  if (result.status !== 200) throw new Error(`İndirilemedi (HTTP ${result.status}).`);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Bu cihazda paylaşım desteklenmiyor.');
  await Sharing.shareAsync(result.uri, { mimeType, dialogTitle: filename });
}

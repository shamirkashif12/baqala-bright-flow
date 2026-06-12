import AsyncStorage from "@react-native-async-storage/async-storage";

export const storage = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const v = await AsyncStorage.getItem(key);
      return v ? (JSON.parse(v) as T) : null;
    } catch { return null; }
  },
  async set<T>(key: string, value: T): Promise<void> {
    try { await AsyncStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
  async remove(key: string): Promise<void> {
    try { await AsyncStorage.removeItem(key); } catch {}
  },
};

export const KEYS = {
  session: "@mart:session",
  branch: "@mart:branch",
  terminal: "@mart:terminal",
  opening: "@mart:opening",
};
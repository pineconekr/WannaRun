import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'kr.wannarun.app',
  appName: 'WannaRun',
  webDir: 'dist',
  android: { useLegacyBridge: true },
  plugins: { CapacitorHttp: { enabled: true } },
};

export default config;

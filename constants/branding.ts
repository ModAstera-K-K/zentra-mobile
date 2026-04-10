import type { ImageSourcePropType } from 'react-native';

export const BrandAssets = {
  logoDark: require('../assets/branding/zentra-logo-dark.png') as ImageSourcePropType,
  logoLight: require('../assets/branding/zentra-logo-light.png') as ImageSourcePropType,
} as const;

export function getBrandLogo(colorScheme: 'light' | 'dark'): ImageSourcePropType {
  return colorScheme === 'dark' ? BrandAssets.logoDark : BrandAssets.logoLight;
}

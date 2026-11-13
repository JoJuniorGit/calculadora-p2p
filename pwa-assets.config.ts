import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

const BRAND_BLUE = '#0f62fe';

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    transparent: {
      ...minimal2023Preset.transparent,
      padding: 0,
      resizeOptions: { fit: 'contain', background: BRAND_BLUE },
    },
    maskable: {
      ...minimal2023Preset.maskable,
      padding: 0.15,
      resizeOptions: { fit: 'contain', background: BRAND_BLUE },
    },
    apple: {
      ...minimal2023Preset.apple,
      padding: 0.15,
      resizeOptions: { fit: 'contain', background: BRAND_BLUE },
    },
  },
  images: ['public/icon-source.svg'],
});

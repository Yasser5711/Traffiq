import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './design.css';
import './app.css';
import { polyfillCountryFlagEmojis } from 'country-flag-emoji-polyfill';
import flagFont from 'country-flag-emoji-polyfill/dist/TwemojiCountryFlags.woff2?url';
import { Root } from './Root';

// Windows has no flag emojis; load a flags-only font (self-hosted) when needed.
polyfillCountryFlagEmojis('Twemoji Country Flags', flagFont);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

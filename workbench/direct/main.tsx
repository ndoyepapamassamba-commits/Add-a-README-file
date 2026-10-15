import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { installEmojiButtons } from './lib/emojiButtons';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// 3D emoji on every button (decorative, CSS only).
installEmojiButtons();

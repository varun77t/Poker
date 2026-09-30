// Josefin Sans letters the headings (one weight, 600); Nunito Sans carries every name, number and control.
import '@fontsource/josefin-sans/600.css';
import '@fontsource/nunito-sans/500.css';
import '@fontsource/nunito-sans/600.css';
import '@fontsource/nunito-sans/700.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initConnection } from './socket/connection';
import './styles/global.css';

initConnection();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root element');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

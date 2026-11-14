import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import './styles/base.css';
import './styles/board.css';
import './styles/playbook.css';
import './styles/media.css';
import './styles/demo-viewer.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

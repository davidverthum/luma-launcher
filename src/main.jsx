import './styles/tokens.css';
import './styles/bundle.css';
import './styles/app.css';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { platform } from './native.js';

document.documentElement.classList.add('os-' + platform());
createRoot(document.getElementById('root')).render(<App />);

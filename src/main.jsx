import './styles/tokens.css';
import './styles/bundle.css';
import './styles/app.css';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { platform, skinFor } from './native.js';
import { setSkinResolver } from './ds/index.js';

document.documentElement.classList.add('os-' + platform());
// Every player head shows that player's real Ely.by face.
setSkinResolver(skinFor);
createRoot(document.getElementById('root')).render(<App />);

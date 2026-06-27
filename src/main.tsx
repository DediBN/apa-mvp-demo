import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import PainScreen from './components/PainScreen';
import { LandingScreen } from './components/command-center/landing-screen';
import App from './App';
import './index.css';

type Screen = 'pain' | 'landing' | 'demo';

function Root() {
  const [screen, setScreen] = useState<Screen>('pain');

  if (screen === 'pain') {
    return <PainScreen onContinue={() => setScreen('landing')} />;
  }

  if (screen === 'landing') {
    return <LandingScreen onStart={() => setScreen('demo')} />;
  }

  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);

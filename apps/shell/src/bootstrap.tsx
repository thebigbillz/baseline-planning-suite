import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@baseline/tokens/tokens.css';
import './global.css';
import { App } from './App';
import { loadRuntimeConfig } from './config';

const root = createRoot(document.getElementById('root') as HTMLElement);

loadRuntimeConfig()
  .then((config) =>
    root.render(
      <StrictMode>
        <App config={config} />
      </StrictMode>,
    ),
  )
  .catch((error: unknown) => {
    root.render(
      <p style={{ padding: 32, fontFamily: 'system-ui' }}>
        Baseline could not read its runtime configuration: {error instanceof Error ? error.message : String(error)}
      </p>,
    );
  });

import { createRoot } from 'react-dom/client';
import '@baseline/tokens/tokens.css';
import './standalone.css';
import { Harness } from './Harness';

createRoot(document.getElementById('root') as HTMLElement).render(<Harness />);

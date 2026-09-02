import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { EditorSessionGate } from './components/shared/EditorSessionGate'
import './styles/tokens.css'
import './styles/global.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EditorSessionGate><App /></EditorSessionGate>
  </StrictMode>,
)

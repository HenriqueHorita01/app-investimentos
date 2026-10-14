import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import App from './App'
import { registerSW } from 'virtual:pwa-register'
import './index.css'

// PWA: ao sair versão nova, o service worker assume e a página recarrega sozinha.
// Também procura atualização sempre que o app volta para a tela (celular).
registerSW({
  immediate: true,
  onRegisteredSW(_url, registro) {
    if (!registro) return
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registro.update().catch(() => {})
    })
    setInterval(() => registro.update().catch(() => {}), 60 * 60 * 1000)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)

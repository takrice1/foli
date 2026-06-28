import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { registerSW } from 'virtual:pwa-register'

// When a new service worker takes over, reload so users get fresh CSS/JS immediately.
registerSW({ immediate: true, onNeedRefresh() { location.reload(); } })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

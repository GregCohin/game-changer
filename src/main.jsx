import React from 'react'
import ReactDOM from 'react-dom/client'
import App, { loadMatchCacheOnce, loadObsMatchCacheOnce } from './App.jsx'

// Précharge les caches de matchs (IndexedDB) avant le premier rendu : plusieurs écrans lisent ces
// caches de façon synchrone dans leur propre effet de montage, sans attendre la fin du chargement
// asynchrone — les charger ici, une fois pour toutes avant que React ne monte quoi que ce soit,
// évite la course qui pouvait sinon laisser certaines statistiques bloquées à zéro.
Promise.allSettled([loadMatchCacheOnce(), loadObsMatchCacheOnce()]).finally(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})

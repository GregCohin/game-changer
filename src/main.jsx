import React from 'react'
import ReactDOM from 'react-dom/client'
import App, { loadMatchCacheOnce, loadObsMatchCacheOnce } from './App.jsx'
import ErrorBoundary from './lib/ErrorBoundary.jsx'
import StorageWarning from './lib/StorageWarning.jsx'
import StaffConfirmation, { arrivedFromEmailLink } from './portail/StaffConfirmation.jsx'
import { exportFullBackupFile } from './lib/fullBackup.js'
import { requestPersistence } from './lib/storageGauge.js'

// Sauvegarde de secours, indépendante de l'arbre React : utilisée par l'écran d'erreur (si l'app plante)
// et par le bandeau « stockage plein ».
const rescue = () => exportFullBackupFile()

// Quand le staff ouvre le lien de connexion reçu par e-mail, l'adresse porte `#confirmation?token_hash=…` : une page
// de confirmation s'affiche À LA PLACE de l'app, et le jeton n'est vérifié qu'à l'appui sur son bouton (un scanner de
// messagerie qui ouvre le lien ne le consomme pas). Ensuite, ou si la personne repart de zéro, l'app s'affiche.
function Root() {
  const [confirming, setConfirming] = React.useState(arrivedFromEmailLink)
  // Lien collé dans la barre d'adresse de l'onglet déjà ouvert : seule la partie « # » change, la page n'est pas rechargée.
  React.useEffect(() => {
    const onHashChange = () => { if (arrivedFromEmailLink()) setConfirming(true) }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  if (confirming) return <StaffConfirmation onDone={() => setConfirming(false)} />
  return <App />
}

// Précharge les caches de matchs (IndexedDB) avant le premier rendu : plusieurs écrans lisent ces
// caches de façon synchrone dans leur propre effet de montage, sans attendre la fin du chargement
// asynchrone — les charger ici, une fois pour toutes avant que React ne monte quoi que ce soit,
// évite la course qui pouvait sinon laisser certaines statistiques bloquées à zéro.
Promise.allSettled([loadMatchCacheOnce(), loadObsMatchCacheOnce()]).finally(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <ErrorBoundary rescue={rescue}>
        <Root />
      </ErrorBoundary>
      <StorageWarning rescue={rescue} />
    </React.StrictMode>,
  )
  // Demande au navigateur de ne pas effacer les données du site quand l'appareil manque de place.
  // Silencieux sur Chrome et Safari ; sur Firefox (qui afficherait une demande de permission sans
  // contexte) elle n'est faite que depuis le bouton de Club → Sauvegarde.
  requestPersistence().catch(() => {})
})

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { verifyEmailCode, confirmTokenHash } from "../lib/emailLogin.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = pas encore su, null = déconnecté

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Envoie un e-mail de connexion : un code à 6 chiffres ET un lien (selon le modèle d'e-mail réglé dans Supabase,
  // voir docs/connexion-parent.md). Le lien mène à parent.html#confirmation… (ConfirmationLayer), qui ne vérifie le
  // jeton qu'à un appui sur un bouton ; avec l'ancien modèle d'e-mail, c'est l'ancien lien magique qui reste valable.
  async function signInWithEmail(email) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + "/parent.html" },
    });
    if (error) throw error;
  }

  // Connexion par le code à 6 chiffres reçu par e-mail. La session est rangée par supabase-js, qui prévient
  // onAuthStateChange ci-dessus : l'écran de connexion est alors remplacé par le portail.
  async function verifyCode(email, code) {
    await verifyEmailCode(supabase, email, code);
  }

  // Connexion par le lien de l'e-mail, après un appui de la personne sur le bouton de la page de confirmation.
  async function confirmLink(tokenHash, type) {
    await confirmTokenHash(supabase, tokenHash, type);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ session, signInWithEmail, verifyCode, confirmLink, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

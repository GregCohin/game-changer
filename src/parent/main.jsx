import React from "react";
import ReactDOM from "react-dom/client";
import { PrivacyLayer } from "./PrivacyLayer";
import { AuthProvider } from "./AuthContext";
import { ParentApp } from "./ParentApp";
import ErrorBoundary from "../lib/ErrorBoundary.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
    <AuthProvider>
      <PrivacyLayer>
        <ParentApp />
      </PrivacyLayer>
    </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

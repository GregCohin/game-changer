import React from "react";
import ReactDOM from "react-dom/client";
import { PrivacyLayer } from "./PrivacyLayer";
import { ConfirmationLayer } from "./ConfirmationLayer";
import { AuthProvider } from "./AuthContext";
import { ParentApp } from "./ParentApp";
import ErrorBoundary from "../lib/ErrorBoundary.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
    <AuthProvider>
      <ConfirmationLayer>
        <PrivacyLayer>
          <ParentApp />
        </PrivacyLayer>
      </ConfirmationLayer>
    </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

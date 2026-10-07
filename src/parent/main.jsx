import React from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider } from "./AuthContext";
import { ParentApp } from "./ParentApp";
import ErrorBoundary from "../lib/ErrorBoundary.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
    <AuthProvider>
      <ParentApp />
    </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

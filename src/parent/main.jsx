import React from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider } from "./AuthContext";
import { ParentApp } from "./ParentApp";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <ParentApp />
    </AuthProvider>
  </React.StrictMode>
);

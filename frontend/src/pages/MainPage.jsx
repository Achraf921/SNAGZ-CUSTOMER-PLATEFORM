import React, { useState, useEffect } from "react";
import Header from "../components/Header";
// import Footer from '../components/common/Footer'; // Footer is now globally in App.jsx
import LoginCard from "../components/auth/LoginCard"; // Import the new LoginCard

// Imports for old login components fully removed

import "./MainPage.css";

function MainPage() {
  const [currentView, setCurrentView] = useState("main"); // 'main', 'clientLogin', 'internalLogin', 'adminLogin'

  // Handle URL parameters to automatically show the correct login form
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const portal = urlParams.get("portal");

    if (portal && portalData[portal]) {
      console.log(
        `🔄 Auto-switching to ${portal} portal based on URL parameter`
      );

      // Check if user is already authenticated for this portal
      const isAuthenticated = checkAuthenticationForPortal(portal);

      if (isAuthenticated) {
        console.log(
          `✅ User is already authenticated for ${portal} portal, redirecting to dashboard`
        );
        // Redirect to the appropriate dashboard instead of showing login form
        window.location.href = portalData[portal].defaultRedirectUrl;
        return;
      }

      setCurrentView(portalData[portal].view);
    }
  }, []);

  // Helper function to check authentication for different portals
  const checkAuthenticationForPortal = (portal) => {
    switch (portal) {
      case "client":
        // Check for client authentication
        return (
          sessionStorage.getItem("userInfo") ||
          localStorage.getItem("userInfo") ||
          sessionStorage.getItem("isFirstLogin") === "true"
        );
      case "internal":
        // Check for internal authentication
        return (
          sessionStorage.getItem("internalUserInfo") ||
          localStorage.getItem("internalUserInfo")
        );
      case "admin":
        // Check for admin authentication
        return (
          sessionStorage.getItem("adminUserInfo") ||
          localStorage.getItem("adminUserInfo")
        );
      default:
        return false;
    }
  };

  const showMainMenu = () => {
    setCurrentView("main");
  };

  const portalData = {
    client: {
      title: "Client",
      description: "Accédez à votre espace client personnalisé.",
      view: "clientLogin",
      defaultRedirectUrl: "/client/dashboard",
      apiEndpoint: "/login-client",
    },
    internal: {
      title: "Personnel Interne",
      description: "Espace réservé aux collaborateurs SNA GZ.",
      view: "internalLogin",
      defaultRedirectUrl: "/internal/dashboard", // Assuming /internal/dashboard exists or will be made
      apiEndpoint: "/login-internal",
    },
    admin: {
      title: "Administrateur",
      description: "Portail de gestion et configuration système.",
      view: "adminLogin",
      defaultRedirectUrl: "/admin/client-accounts",
      apiEndpoint: "/login-admin-portal",
    },
  };

  const renderView = () => {
    if (currentView !== "main") {
      const portalKey = Object.keys(portalData).find(
        (key) => portalData[key].view === currentView
      );
      const selectedPortal = portalData[portalKey];
      return (
        <LoginCard
          portalTitle={selectedPortal.title}
          loginApiEndpoint={selectedPortal.apiEndpoint}
          portalType={portalKey}
          defaultRedirectUrl={selectedPortal.defaultRedirectUrl}
          showMainMenu={showMainMenu}
        />
      );
    }

    return (
      <div className="portal-selection-fullscreen-container">
        <div className="main-page-titles">
          <h1 className="main-page-title-unified">
            Bienvenue sur la plateforme SNA GZ
          </h1>
        </div>
        <p className="main-page-subtitle">
          Veuillez sélectionner votre portail d'accès.
        </p>
        <div className="portal-buttons-grid">
          {Object.keys(portalData).map((key) => {
            const portal = portalData[key];
            return (
              <button
                key={key}
                onClick={() => setCurrentView(portal.view)}
                className="portal-btn-styled"
              >
                <span className="portal-btn-title">{portal.title}</span>
                <span className="portal-btn-description">
                  {portal.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // Use a more descriptive name for the container class if it's not meant to be a card
  const containerClass =
    currentView === "main"
      ? "main-page-no-card-container"
      : "login-view-container";

  return (
    <div className={containerClass}>
      <Header />
      <main
        className={`main-content ${
          currentView !== "main" ? "full-width-content" : ""
        }`}
      >
        {renderView()}
      </main>
      {/* Footer is now global in App.jsx, so no need to render it here conditionally */}
    </div>
  );
}

export default MainPage;

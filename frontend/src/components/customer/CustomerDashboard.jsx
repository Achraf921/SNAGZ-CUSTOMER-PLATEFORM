import React, { useState, useEffect } from "react";
import WelcomeForm from "./WelcomeForm";
import {
  validateUserIdentity,
  clearAllAuthData,
} from "../../utils/authSecurity"; // Import the new form

const CustomerDashboard = () => {
  const [showWelcomeForm, setShowWelcomeForm] = useState(false);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check if this is the first login after password change and if user has customer profile
  useEffect(() => {
    const checkUserProfile = async () => {
      try {
        console.log(
          "🔒 SECURITY: Starting customer dashboard security check..."
        );
        setLoading(true);

        // CRITICAL: Validate user identity before loading any data
        const identityCheck = validateUserIdentity();

        if (!identityCheck.valid) {
          console.error(
            "🚨 SECURITY: User identity validation failed:",
            identityCheck.reason
          );
          clearAllAuthData();
          window.location.href = "/client/login";
          return;
        }

        const userInfo = identityCheck.user;
        const effectiveUserId = userInfo.sub;

        console.log("✅ SECURITY: User identity validated for dashboard");
        console.log("User ID (sub):", effectiveUserId);
        console.log("User email:", userInfo.email);

        // Check if user has a customer profile
        const apiUrl = `/api/customer/by-user-id/${effectiveUserId}`;

        const response = await fetch(apiUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
        });

        const data = await response.json();

        if (response.ok && data.success) {
          // User has a customer profile - show dashboard
          console.log("Customer profile found, showing dashboard");
          setUserData({
            name: data.customer.raisonSociale || userInfo.name || "Client",
            userId: effectiveUserId,
          });
          setShowWelcomeForm(false);
        } else if (data.isNewUser && data.needsWelcomeForm) {
          // New user without customer profile - show welcome form
          console.log("New user detected, showing welcome form");
          setUserData({
            name: userInfo.name || "Nouveau Client",
            userId: effectiveUserId,
          });
          setShowWelcomeForm(true);
        } else {
          // Error or other case - show welcome form as fallback
          console.log(
            "Error checking profile, showing welcome form as fallback"
          );
          setUserData({
            name: userInfo.name || "Client",
            userId: effectiveUserId,
          });
          setShowWelcomeForm(true);
        }
      } catch (error) {
        console.error("Error checking user profile:", error);
        setUserData({
          name: "Client",
          userId: "unknown_user_id",
        });
        setShowWelcomeForm(true);
      } finally {
        setLoading(false);
      }
    };

    checkUserProfile();
  }, []);

  const handleWelcomeFormSubmit = async (formData) => {
    console.log("Welcome form data submitted from dashboard:", formData);

    try {
      // Get userId from sessionStorage or localStorage
      const userId =
        sessionStorage.getItem("userId") ||
        localStorage.getItem("userId") ||
        userData?.userId ||
        "unknown_user_id";

      // Get userInfo from session storage
      let userInfoStr =
        sessionStorage.getItem("userInfo") || localStorage.getItem("userInfo");
      let userInfo = {};
      let sub = null;

      try {
        if (userInfoStr) {
          userInfo = JSON.parse(userInfoStr);
          sub = userInfo.sub;
        }
      } catch (error) {
        console.error("Error parsing userInfo:", error);
      }

      // Use sub as the primary identifier, fallback to userId
      const effectiveUserId = sub || userId;

      // Add userId to form data
      const formDataWithUserId = {
        ...formData,
        userId: effectiveUserId,
      };

      console.log("Form data with userId:", formDataWithUserId);

      // Use relative path to leverage Vite proxy for development
      const backendUrl = "/api/customer/welcome-form";

      console.log("Sending form data to:", backendUrl);

      // Send the form data to our backend API to save in MongoDB
      const response = await fetch(backendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formDataWithUserId),
        credentials: "include", // Include cookies if needed for authentication
      });

      // Check if the response is successful
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `HTTP error! status: ${response.status}`
        );
      }

      // Parse the response data
      const responseData = await response.json();
      console.log("Form submission successful:", responseData);

      // Mark that the user has completed the welcome form
      localStorage.setItem("hasCompletedWelcomeForm", "true");

      // Store the customer ID if available
      if (responseData.customerId) {
        localStorage.setItem("customerId", responseData.customerId);
      }

      // After successful submission, close the form to reveal the dashboard
      setShowWelcomeForm(false);

      // Update user data with the new customer information
      setUserData((prev) => ({
        ...prev,
        name: formData.raisonSociale || prev.name,
      }));

      // Update UI to indicate successful submission if needed
      // For example, you could show a success message

      // You could also refresh user data if needed
      // fetchUserData();
    } catch (error) {
      console.error("Error submitting welcome form:", error);
      // Handle error if needed
    }
  };

  const handleSupportClick = () => {
    // Get support email from environment variable or use default
    const supportEmail =
      process.env.REACT_APP_SUPPORT_EMAIL || "support@snagz.com";
    const subject = encodeURIComponent(
      "Demande de support - Portail Client SNA GZ"
    );
    const body = encodeURIComponent(`Bonjour,

Je souhaite contacter le support concernant mon compte client.

Détails de ma demande :
[Veuillez décrire votre problème ou question ici]

Cordialement,
${userData.name}

---
ID Utilisateur : ${userData.userId}
Date : ${new Date().toLocaleDateString("fr-FR")}`);

    // Open email client with pre-filled information
    window.location.href = `mailto:${supportEmail}?subject=${subject}&body=${body}`;
  };

  if (loading) {
    return <div className="p-4">Chargement du tableau de bord...</div>;
  }

  if (!userData) {
    return (
      <div className="p-4">
        Erreur lors du chargement des données utilisateur...
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <h1 className="text-3xl font-bold text-sna-primary mb-6">
        Tableau de Bord Client
      </h1>
      <p className="mb-4 text-lg">Bonjour, {userData.name} !</p>

      {/* Dashboard content - only show if welcome form is not displayed */}
      {!showWelcomeForm && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div
            className="bg-white p-6 rounded-xl shadow-sm cursor-pointer hover:shadow-xl transition-all duration-300 border border-gray-100 hover:border-blue-300 hover:bg-blue-50/30"
            onClick={() => (window.location.href = "/client/boutiques")}
          >
            <h2 className="text-xl font-semibold text-sna-dark mb-2">
              Mes Boutiques
            </h2>
            <p className="text-gray-600">Gérez vos boutiques en ligne.</p>
          </div>

          <div
            className="bg-white p-6 rounded-xl shadow-sm cursor-pointer hover:shadow-xl transition-all duration-300 border border-gray-100 hover:border-blue-300 hover:bg-blue-50/30"
            onClick={() => (window.location.href = "/client/produits")}
          >
            <h2 className="text-xl font-semibold text-sna-dark mb-2">
              Mes Produits
            </h2>
            <p className="text-gray-600">Ajoutez et gérez vos produits.</p>
          </div>

          <div
            className="bg-white p-6 rounded-xl shadow-sm cursor-pointer hover:shadow-xl transition-all duration-300 border border-gray-100 hover:border-blue-300 hover:bg-blue-50/30"
            onClick={() => (window.location.href = "/client/compte")}
          >
            <h2 className="text-xl font-semibold text-sna-dark mb-2">
              Mon Compte
            </h2>
            <p className="text-gray-600">
              Gérez vos informations personnelles.
            </p>
          </div>

          <div
            className="bg-white p-6 rounded-xl shadow-sm cursor-pointer hover:shadow-xl transition-all duration-300 border border-gray-100 hover:border-green-300 hover:bg-green-50/30"
            onClick={() => (window.location.href = "/client/boutiques/create")}
          >
            <h2 className="text-xl font-semibold text-sna-dark mb-2">
              Créer une Boutique
            </h2>
            <p className="text-gray-600">
              Créez votre nouvelle boutique en ligne.
            </p>
          </div>

          <div
            className="bg-white p-6 rounded-xl shadow-sm cursor-pointer hover:shadow-xl transition-all duration-300 border border-gray-100 hover:border-purple-300 hover:bg-purple-50/30"
            onClick={() => (window.location.href = "/client/produits/create")}
          >
            <h2 className="text-xl font-semibold text-sna-dark mb-2">
              Créer un Produit
            </h2>
            <p className="text-gray-600">
              Ajoutez un nouveau produit à vos boutiques.
            </p>
          </div>

          <div
            className="bg-white p-6 rounded-xl shadow-sm cursor-pointer hover:shadow-xl transition-all duration-300 border border-gray-100 hover:border-orange-300 hover:bg-orange-50/30"
            onClick={handleSupportClick}
          >
            <h2 className="text-xl font-semibold text-sna-dark mb-2">
              Support
            </h2>
            <p className="text-gray-600">
              Contacter notre équipe d'assistance.
            </p>
          </div>
        </div>
      )}

      {showWelcomeForm && (
        <WelcomeForm
          onSubmit={handleWelcomeFormSubmit}
          // No onClose prop - form cannot be closed
        />
      )}
    </div>
  );
};

export default CustomerDashboard;

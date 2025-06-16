import React, { useState, useEffect } from "react";
import WelcomeForm from "./WelcomeForm"; // Import the new form

const CustomerDashboard = () => {
  const [showWelcomeForm, setShowWelcomeForm] = useState(false);
  const [userData, setUserData] = useState(null);

  // Check if this is the first login after password change
  useEffect(() => {
    // Get the first login status from localStorage or sessionStorage
    const isFirstLogin = sessionStorage.getItem("isFirstLogin") === "true";
    const hasCompletedWelcomeForm =
      localStorage.getItem("hasCompletedWelcomeForm") === "true";
    
    // Get userId from sessionStorage (set during login)
    const userId = sessionStorage.getItem("userId") || localStorage.getItem("userId");

    // Show welcome form if it's first login and user hasn't completed the form yet
    if (isFirstLogin && !hasCompletedWelcomeForm) {
      setShowWelcomeForm(true);
      // Clear the first login flag so it doesn't show again on refresh
      sessionStorage.removeItem("isFirstLogin");
    }

    // Fetch user data - include userId if available
    setUserData({ 
      name: "Achraf Bayi", 
      userId: userId || "unknown_user_id" 
    }); // Example user - replace with actual API call
  }, []);

  const handleWelcomeFormSubmit = async (formData) => {
    console.log("Welcome form data submitted from dashboard:", formData);

    try {
      // Get userId from sessionStorage or localStorage
      const userId = sessionStorage.getItem("userId") || 
                     localStorage.getItem("userId") || 
                     userData?.userId || 
                     "unknown_user_id";
      
      // Add userId to form data
      const formDataWithUserId = {
        ...formData,
        userId: userId,
      };
      
      console.log("Form data with userId:", formDataWithUserId);
      
      // Make sure we have the correct backend URL
      // If running on localhost, we need to specify the full URL with port
      const backendUrl = process.env.NODE_ENV === 'production' 
        ? '/api/customer/welcome-form'
        : 'http://localhost:5000/api/customer/welcome-form';
      
      console.log('Sending form data to:', backendUrl);
      
      // Send the form data to our backend API to save in MongoDB
      const response = await fetch(backendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formDataWithUserId),
        credentials: 'include', // Include cookies if needed for authentication
      });
      
      // Check if the response is successful
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      
      // Parse the response data
      const responseData = await response.json();
      console.log('Form submission successful:', responseData);
      
      // Mark that the user has completed the welcome form
      localStorage.setItem("hasCompletedWelcomeForm", "true");
      
      // Store the customer ID if available
      if (responseData.customerId) {
        localStorage.setItem("customerId", responseData.customerId);
      }

      // After successful submission, close the form to reveal the dashboard
      setShowWelcomeForm(false);

      // Update UI to indicate successful submission if needed
      // For example, you could show a success message

      // You could also refresh user data if needed
      // fetchUserData();
    } catch (error) {
      console.error("Error submitting welcome form:", error);
      // Handle error if needed
    }
  };

  if (!userData) {
    return <div className="p-4">Chargement du tableau de bord...</div>;
  }

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <h1 className="text-3xl font-bold text-sna-primary mb-6">
        Tableau de Bord Client
      </h1>
      <p className="mb-4 text-lg">Bonjour, {userData.name} !</p>

      {/* For development testing only - remove in production */}
      {process.env.NODE_ENV === "development" && (
        <button
          onClick={() => {
            sessionStorage.setItem("isFirstLogin", "true");
            localStorage.removeItem("hasCompletedWelcomeForm");
            setShowWelcomeForm(true);
          }}
          className="mb-6 px-4 py-2 bg-sna-secondary text-sna-dark font-medium rounded-md hover:bg-sna-secondary/90 transition-colors"
        >
          Simuler Première Connexion (Test)
        </button>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Example dashboard cards - replace with actual content */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold text-sna-dark mb-2">
            Mes Boutiques
          </h2>
          <p className="text-gray-600">Gérer vos boutiques en ligne.</p>
          <a
            href="/client/boutiques"
            className="text-sna-primary hover:underline mt-4 inline-block"
          >
            Voir mes boutiques
          </a>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold text-sna-dark mb-2">
            Mon Compte
          </h2>
          <p className="text-gray-600">
            Mettre à jour vos informations personnelles.
          </p>
          <a
            href="/client/compte"
            className="text-sna-primary hover:underline mt-4 inline-block"
          >
            Gérer mon compte
          </a>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold text-sna-dark mb-2">Support</h2>
          <p className="text-gray-600">Contacter notre équipe d'assistance.</p>
        </div>
      </div>

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

import React, { useState, useEffect } from "react";
import {
  FaLock,
  FaEye,
  FaEyeSlash,
  FaCheckCircle,
  FaExclamationTriangle,
} from "react-icons/fa";

const ResetPasswordPage = () => {
  // Extract token from URL parameters manually
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get("token");

  const [tokenData, setTokenData] = useState(null);
  const [isValidatingToken, setIsValidatingToken] = useState(true);
  const [tokenError, setTokenError] = useState("");

  const [formData, setFormData] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const [showPasswords, setShowPasswords] = useState({
    new: false,
    confirm: false,
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Validate token on component mount
  useEffect(() => {
    if (!token) {
      setTokenError("Token de réinitialisation manquant");
      setIsValidatingToken(false);
      return;
    }

    validateToken();
  }, [token]);

  const validateToken = async () => {
    try {
      setIsValidatingToken(true);
      const response = await fetch(`/api/password-reset/verify/${token}`);
      const data = await response.json();

      if (data.success) {
        setTokenData(data);
        setTokenError("");
      } else {
        setTokenError(data.message || "Token invalide ou expiré");
      }
    } catch (error) {
      console.error("Error validating token:", error);
      setTokenError("Erreur lors de la validation du token");
    } finally {
      setIsValidatingToken(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  const togglePasswordVisibility = (field) => {
    setShowPasswords((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  const validateForm = () => {
    const newErrors = {};

    // New password validation
    if (!formData.newPassword) {
      newErrors.newPassword = "Le nouveau mot de passe est requis";
    } else if (formData.newPassword.length < 8) {
      newErrors.newPassword =
        "Le mot de passe doit contenir au moins 8 caractères";
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.newPassword)) {
      newErrors.newPassword =
        "Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre";
    }

    // Confirm password validation
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = "La confirmation du mot de passe est requise";
    } else if (formData.newPassword !== formData.confirmPassword) {
      newErrors.confirmPassword = "Les mots de passe ne correspondent pas";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      const response = await fetch("/api/password-reset/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          newPassword: formData.newPassword,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(true);
        // Redirect to appropriate login page after 3 seconds
        setTimeout(() => {
          window.location.href = "/";
        }, 3000);
      } else {
        setErrors({
          general: data.message || "Erreur lors de la réinitialisation",
        });
      }
    } catch (error) {
      console.error("Error resetting password:", error);
      setErrors({ general: "Erreur de connexion. Veuillez réessayer." });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state while validating token
  if (isValidatingToken) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div className="bg-white p-8 rounded-lg shadow-md text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <h2 className="text-lg font-medium text-gray-900 mb-2">
              Validation du lien...
            </h2>
            <p className="text-sm text-gray-600">
              Veuillez patienter pendant que nous vérifions votre lien de
              réinitialisation.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Error state - invalid token
  if (tokenError) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div className="bg-white p-8 rounded-lg shadow-md text-center">
            <FaExclamationTriangle className="text-red-500 text-4xl mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Lien invalide
            </h2>
            <p className="text-sm text-gray-600 mb-6">{tokenError}</p>
            <div className="space-y-3">
              <button
                onClick={() => (window.location.href = "/")}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Retour à la connexion
              </button>
              <p className="text-xs text-gray-500">
                Vous pouvez demander un nouveau lien de réinitialisation depuis
                la page de connexion.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div className="bg-white p-8 rounded-lg shadow-md text-center">
            <FaCheckCircle className="text-green-500 text-4xl mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-green-800 mb-2">
              Mot de passe réinitialisé !
            </h2>
            <p className="text-sm text-green-600 mb-6">
              Votre mot de passe a été modifié avec succès. Vous allez être
              redirigé vers la page de connexion.
            </p>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-green-700 text-xs">
                <strong>Conseil :</strong> Utilisez votre nouveau mot de passe
                pour vous connecter.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main reset password form
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="bg-white p-8 rounded-lg shadow-md">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <FaLock className="text-blue-500 text-3xl" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">
              Nouveau mot de passe
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Choisissez un nouveau mot de passe sécurisé pour{" "}
              <span className="font-medium text-blue-600">
                {tokenData?.email}
              </span>
            </p>
          </div>

          {/* General Error */}
          {errors.general && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-center">
                <FaExclamationTriangle className="text-red-500 text-sm mr-2" />
                <p className="text-red-600 text-sm">{errors.general}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* New Password */}
            <div>
              <label
                htmlFor="newPassword"
                className="block text-sm font-medium text-gray-700"
              >
                Nouveau mot de passe <span className="text-red-500">*</span>
              </label>
              <div className="mt-1 relative">
                <input
                  type={showPasswords.new ? "text" : "password"}
                  id="newPassword"
                  name="newPassword"
                  value={formData.newPassword}
                  onChange={handleChange}
                  className={`block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm pr-10 ${
                    errors.newPassword ? "border-red-500" : ""
                  }`}
                  placeholder="Saisissez votre nouveau mot de passe"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility("new")}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  disabled={isSubmitting}
                >
                  {showPasswords.new ? (
                    <FaEyeSlash className="h-4 w-4 text-gray-400" />
                  ) : (
                    <FaEye className="h-4 w-4 text-gray-400" />
                  )}
                </button>
              </div>
              {errors.newPassword && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.newPassword}
                </p>
              )}
              <div className="mt-2 text-xs text-gray-500">
                Le mot de passe doit contenir au moins 8 caractères avec une
                majuscule, une minuscule et un chiffre.
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-gray-700"
              >
                Confirmer le nouveau mot de passe{" "}
                <span className="text-red-500">*</span>
              </label>
              <div className="mt-1 relative">
                <input
                  type={showPasswords.confirm ? "text" : "password"}
                  id="confirmPassword"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className={`block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm pr-10 ${
                    errors.confirmPassword ? "border-red-500" : ""
                  }`}
                  placeholder="Confirmez votre nouveau mot de passe"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility("confirm")}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  disabled={isSubmitting}
                >
                  {showPasswords.confirm ? (
                    <FaEyeSlash className="h-4 w-4 text-gray-400" />
                  ) : (
                    <FaEye className="h-4 w-4 text-gray-400" />
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.confirmPassword}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                  isSubmitting
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {isSubmitting ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Réinitialisation...
                  </div>
                ) : (
                  "Réinitialiser le mot de passe"
                )}
              </button>
            </div>
          </form>

          {/* Back to login link */}
          <div className="mt-6 text-center">
            <button
              onClick={() => (window.location.href = "/")}
              className="text-sm text-blue-600 hover:text-blue-500"
              disabled={isSubmitting}
            >
              ← Retour à la connexion
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;

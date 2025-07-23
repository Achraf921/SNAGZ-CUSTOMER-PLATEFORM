import React, { useState } from "react";
import {
  FaUser,
  FaLock,
  FaEye,
  FaEyeSlash,
  FaCheckCircle,
} from "react-icons/fa";

const InternalProfile = () => {
  const [formData, setFormData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

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

    // Current password validation
    if (!formData.currentPassword) {
      newErrors.currentPassword = "Le mot de passe actuel est requis";
    }

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

    // Check if new password is different from current
    if (
      formData.currentPassword &&
      formData.newPassword &&
      formData.currentPassword === formData.newPassword
    ) {
      newErrors.newPassword =
        "Le nouveau mot de passe doit être différent de l'actuel";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccess(false);

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(true);
        setFormData({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
        setErrors({});

        // Show success message for 3 seconds then hide
        setTimeout(() => setSuccess(false), 3000);
      } else {
        if (data.error === "Invalid current password") {
          setErrors({ currentPassword: "Mot de passe actuel incorrect" });
        } else {
          setErrors({
            general:
              data.message || "Erreur lors du changement de mot de passe",
          });
        }
      }
    } catch (error) {
      console.error("Error changing password:", error);
      setErrors({ general: "Erreur de connexion. Veuillez réessayer." });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white shadow-sm rounded-lg">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center">
            <FaUser className="text-blue-500 text-xl mr-3" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Mon Profil</h1>
              <p className="text-sm text-gray-600 mt-1">
                Gérez vos paramètres de compte et sécurité
              </p>
            </div>
          </div>
        </div>

        {/* Password Change Form */}
        <div className="px-6 py-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <FaLock className="text-gray-500 mr-2" />
              Changer le mot de passe
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Pour votre sécurité, veuillez saisir votre mot de passe actuel
              puis définir un nouveau mot de passe.
            </p>
          </div>

          {/* Success Message */}
          {success && (
            <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center">
                <FaCheckCircle className="text-green-500 text-lg mr-3" />
                <div>
                  <h3 className="text-green-800 font-medium">
                    Mot de passe modifié avec succès
                  </h3>
                  <p className="text-green-600 text-sm mt-1">
                    Votre mot de passe a été mis à jour. Utilisez-le lors de
                    votre prochaine connexion.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* General Error */}
          {errors.general && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-600 text-sm">{errors.general}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Current Password */}
            <div>
              <label
                htmlFor="currentPassword"
                className="block text-sm font-medium text-gray-700"
              >
                Mot de passe actuel <span className="text-red-500">*</span>
              </label>
              <div className="mt-1 relative">
                <input
                  type={showPasswords.current ? "text" : "password"}
                  id="currentPassword"
                  name="currentPassword"
                  value={formData.currentPassword}
                  onChange={handleChange}
                  className={`block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm pr-10 ${
                    errors.currentPassword ? "border-red-500" : ""
                  }`}
                  placeholder="Saisissez votre mot de passe actuel"
                />
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility("current")}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  {showPasswords.current ? (
                    <FaEyeSlash className="h-4 w-4 text-gray-400" />
                  ) : (
                    <FaEye className="h-4 w-4 text-gray-400" />
                  )}
                </button>
              </div>
              {errors.currentPassword && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.currentPassword}
                </p>
              )}
            </div>

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
                />
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility("new")}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
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
                />
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility("confirm")}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
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
            <div className="flex justify-end pt-4">
              <button
                type="submit"
                disabled={isLoading}
                className={`px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                  isLoading
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Mise à jour...
                  </div>
                ) : (
                  "Changer le mot de passe"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default InternalProfile;

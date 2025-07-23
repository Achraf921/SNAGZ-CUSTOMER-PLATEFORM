import React, { useState } from "react";

const CreateUser = ({ userType, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: userType,
    sendWelcomeEmail: false,
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPasswordGenerator, setShowPasswordGenerator] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);

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

  // Generate a secure random password
  const generateRandomPassword = () => {
    const length = 12;
    const charset =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";

    // Ensure password has at least one of each required character type
    const lowercase = "abcdefghijklmnopqrstuvwxyz";
    const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const numbers = "0123456789";
    const symbols = "!@#$%^&*";

    // Add one character from each required category
    password += lowercase.charAt(Math.floor(Math.random() * lowercase.length));
    password += uppercase.charAt(Math.floor(Math.random() * uppercase.length));
    password += numbers.charAt(Math.floor(Math.random() * numbers.length));
    password += symbols.charAt(Math.floor(Math.random() * symbols.length));

    // Fill the rest randomly
    for (let i = password.length; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }

    // Shuffle the password to randomize character positions
    return password
      .split("")
      .sort(() => Math.random() - 0.5)
      .join("");
  };

  const handleGeneratePassword = () => {
    const newPassword = generateRandomPassword();
    setGeneratedPassword(newPassword);
    setFormData((prev) => ({
      ...prev,
      password: newPassword,
      confirmPassword: newPassword,
    }));
    setShowPasswordGenerator(true);

    // Clear any password errors
    setErrors((prev) => ({
      ...prev,
      password: "",
      confirmPassword: "",
    }));
  };

  const handleCopyPassword = async () => {
    try {
      await navigator.clipboard.writeText(generatedPassword);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error("Failed to copy password:", err);
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) {
      newErrors.name = "Le nom est requis";
    }
    if (!formData.email.trim()) {
      newErrors.email = "L'email est requis";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "L'email n'est pas valide";
    }
    if (!formData.password) {
      newErrors.password = "Le mot de passe est requis";
    } else if (formData.password.length < 6) {
      newErrors.password =
        "Le mot de passe doit contenir au moins 6 caractères";
    }
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Les mots de passe ne correspondent pas";
    }
    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = validateForm();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      const apiUrl =
        process.env.NODE_ENV === "production"
          ? `/api/accounts/${userType}`
          : `http://localhost:5000/api/accounts/${userType}`;

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          sendWelcomeEmail: formData.sendWelcomeEmail,
        }),
        credentials: "include",
      });

      const data = await response.json();

      if (data.success) {
        console.log("User created successfully:", data);
        onSuccess(data);
      } else {
        throw new Error(data.message || "Failed to create user");
      }
    } catch (error) {
      console.error("Error creating user:", error);
      setErrors({
        submit:
          error.message ||
          "Une erreur est survenue lors de la création du compte",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">
            Créer un Compte{" "}
            {userType === "internal"
              ? "Personnel"
              : userType === "client"
                ? "Client"
                : "Administrateur"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <span className="sr-only">Fermer</span>
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700"
            >
              Nom complet
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary sm:text-sm ${
                errors.name ? "border-red-500" : ""
              }`}
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-600">{errors.name}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700"
            >
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary sm:text-sm ${
                errors.email ? "border-red-500" : ""
              }`}
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-600">{errors.email}</p>
            )}
          </div>

          <div>
            <div className="flex justify-between items-center">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700"
              >
                Mot de passe
              </label>
              <button
                type="button"
                onClick={handleGeneratePassword}
                className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded text-sna-primary hover:text-sna-primary/80 focus:outline-none"
              >
                <svg
                  className="w-4 h-4 mr-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Générer mot de passe
              </button>
            </div>
            <div className="relative">
              <input
                type={showPasswordGenerator ? "text" : "password"}
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary sm:text-sm ${
                  errors.password ? "border-red-500" : ""
                } ${showPasswordGenerator ? "pr-20" : ""}`}
              />
              {showPasswordGenerator && generatedPassword && (
                <div className="absolute inset-y-0 right-0 flex items-center">
                  <button
                    type="button"
                    onClick={() =>
                      setShowPasswordGenerator(!showPasswordGenerator)
                    }
                    className="p-2 text-gray-400 hover:text-gray-600 focus:outline-none"
                    title={showPasswordGenerator ? "Masquer" : "Afficher"}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      {showPasswordGenerator ? (
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"
                        />
                      ) : (
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      )}
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyPassword}
                    className="p-2 text-gray-400 hover:text-gray-600 focus:outline-none mr-1"
                    title="Copier"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  </button>
                </div>
              )}
            </div>
            {showPasswordGenerator && generatedPassword && (
              <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <svg
                      className="w-4 h-4 text-green-400 mr-2"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-sm text-green-800 font-medium">
                      Mot de passe généré
                    </span>
                  </div>
                  {copySuccess && (
                    <span className="text-xs text-green-600 font-medium">
                      ✓ Copié!
                    </span>
                  )}
                </div>
                <p className="text-xs text-green-700 mt-1">
                  Mot de passe sécurisé généré automatiquement. Assurez-vous de
                  le communiquer à l'utilisateur de manière sécurisée.
                </p>
              </div>
            )}
            {errors.password && (
              <p className="mt-1 text-sm text-red-600">{errors.password}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-gray-700"
            >
              Confirmer le mot de passe
            </label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary sm:text-sm ${
                errors.confirmPassword ? "border-red-500" : ""
              }`}
            />
            {errors.confirmPassword && (
              <p className="mt-1 text-sm text-red-600">
                {errors.confirmPassword}
              </p>
            )}
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="sendWelcomeEmail"
              name="sendWelcomeEmail"
              checked={formData.sendWelcomeEmail}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  sendWelcomeEmail: e.target.checked,
                }))
              }
              className="h-4 w-4 text-sna-primary focus:ring-sna-primary border-gray-300 rounded"
            />
            <label
              htmlFor="sendWelcomeEmail"
              className="ml-2 block text-sm text-gray-900"
            >
              Envoyer un email de bienvenue (avec mot de passe temporaire)
            </label>
          </div>

          {!formData.sendWelcomeEmail && generatedPassword && (
            <div className="mt-3 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <svg
                    className="w-5 h-5 text-yellow-400 mr-2"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-sm text-yellow-800 font-medium">
                    Mot de passe à communiquer manuellement
                  </span>
                </div>
                {copySuccess && (
                  <span className="text-xs text-green-600 font-medium">
                    ✓ Copié!
                  </span>
                )}
              </div>
              <p className="text-xs text-yellow-700 mt-2">
                L'email de bienvenue est désactivé. Vous devrez communiquer ces
                identifiants manuellement à l'utilisateur :
              </p>
              <div className="mt-2 p-2 bg-white border border-yellow-300 rounded">
                <p className="text-sm">
                  <strong>Email :</strong> {formData.email}
                </p>
                <p className="text-sm">
                  <strong>Mot de passe :</strong> {generatedPassword}
                </p>
              </div>
            </div>
          )}

          {!formData.sendWelcomeEmail && (
            <div className="bg-blue-50 p-4 rounded-md">
              <p className="text-sm text-blue-700">
                L'utilisateur recevra les informations de connexion manuellement
                et devra changer son mot de passe lors de sa première connexion.
              </p>
            </div>
          )}

          {errors.submit && (
            <div className="bg-red-50 p-4 rounded-md">
              <p className="text-sm text-red-600">{errors.submit}</p>
            </div>
          )}

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-sna-primary hover:bg-sna-primary/90 disabled:opacity-50 flex items-center"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Création...
                </>
              ) : (
                "Créer"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateUser;

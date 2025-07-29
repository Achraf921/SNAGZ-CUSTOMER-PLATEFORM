import React, { useState } from "react";

function WelcomeForm({ onSubmit, onClose }) {
  const [formData, setFormData] = useState({
    // Section 1: Information société
    raisonSociale: "",
    formeJuridique: "",
    adresseSociete: "",
    codePostalSociete: "",
    villeSociete: "",
    paysSociete: "France", // Default value
    siret: "",
    numTVA: "",
    numEORI: "",
    capitalSocial: "",
    codeAPE: "",
    tvaIntracom: "",
    iban: "", // New mandatory field

    // Section 2: Contacts
    contact1Nom: "",
    contact1Telephone: "",
    contact1Email: "",
    contact2Nom: "",
    contact2Telephone: "",
    contact2Email: "",
    contactFacturationNom: "",
    contactFacturationTelephone: "",
    contactFacturationEmail: "",
    emailRetourColis: "",

    // Section 3: Signature
    dateSoumission: new Date().toISOString().slice(0, 10), // Default to today
    nomSoumission: "",
    fonctionSoumission: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const validateForm = () => {
    const requiredFields = {
      // Mandatory company information
      raisonSociale: "Raison Sociale",
      adresseSociete: "Adresse",
      codePostalSociete: "Code Postal",
      villeSociete: "Ville",
      paysSociete: "Pays",
      iban: "IBAN",

      // Mandatory contact information
      contact1Nom: "Nom et Prénom du contact principal",
      contact1Telephone: "Téléphone du contact principal",
      contact1Email: "Email du contact principal",

      // Mandatory submission information
      dateSoumission: "Date de soumission",
      nomSoumission: "Nom du déclarant",
      fonctionSoumission: "Fonction du déclarant",
    };

    const missingFields = [];

    for (const [field, label] of Object.entries(requiredFields)) {
      if (!formData[field] || formData[field].trim() === "") {
        missingFields.push(label);
      }
    }

    if (missingFields.length > 0) {
      setError(
        `Veuillez remplir tous les champs obligatoires : ${missingFields.join(", ")}`
      );
      return false;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.contact1Email)) {
      setError(
        "Veuillez saisir une adresse email valide pour le contact principal"
      );
      return false;
    }

    // Validate IBAN format (basic validation)
    const ibanRegex = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{4}[0-9]{7}([A-Z0-9]?){0,16}$/;
    if (!ibanRegex.test(formData.iban.replace(/\s/g, ""))) {
      setError("Veuillez saisir un IBAN valide");
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    if (!validateForm()) {
      setIsLoading(false);
      return;
    }

    try {
      // Call the onSubmit callback provided by the parent component
      if (onSubmit) {
        await onSubmit(formData);
      }

      console.log("Données du formulaire de bienvenue:", formData);

      // No alert to interrupt the flow
      setIsLoading(false);

      // No need for onClose as we want the parent to handle this
    } catch (err) {
      setError("Erreur lors de la soumission du formulaire.");
      setIsLoading(false);
      console.error("Erreur soumission formulaire bienvenue:", err);
    }
  };

  const renderSectionTitle = (title) => (
    <h3 className="text-xl font-semibold text-sna-primary mb-4 pt-3 pb-2 border-b border-gray-300">
      {title}
    </h3>
  );

  const renderInput = (
    name,
    label,
    type = "text",
    required = false,
    placeholder = ""
  ) => (
    <div className="mb-4">
      <label
        htmlFor={name}
        className="block text-sm font-medium text-gray-700 mb-1"
      >
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        name={name}
        id={name}
        value={formData[name]}
        onChange={handleChange}
        required={required}
        placeholder={placeholder}
        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-sna-primary focus:border-sna-primary sm:text-sm"
      />
    </div>
  );

  // Simplified country select for example
  const renderCountrySelect = (name, label, required = false) => (
    <div className="mb-4">
      <label
        htmlFor={name}
        className="block text-sm font-medium text-gray-700 mb-1"
      >
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      <select
        name={name}
        id={name}
        value={formData[name]}
        onChange={handleChange}
        required={required}
        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-sna-primary focus:border-sna-primary sm:text-sm"
      >
        <option value="France">France</option>
        <option value="Belgique">Belgique</option>
        <option value="Suisse">Suisse</option>
        <option value="Luxembourg">Luxembourg</option>
        <option value="Autre">Autre</option>
      </select>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex justify-center items-start z-50 overflow-y-auto py-10">
      <div className="bg-white p-6 sm:p-8 rounded-lg shadow-xl w-full max-w-4xl my-auto">
        <div className="flex justify-center items-center mb-8 mt-4">
          <h2 className="text-3xl font-bold text-sna-primary">
            Bienvenue sur notre portail !
          </h2>
        </div>
        <p className="text-gray-600 mb-6">
          Pour activer complètement votre compte et accéder à toutes nos
          fonctionnalités, veuillez compléter les informations ci-dessous.
          <br />
          <span className="text-red-500 font-medium">
            * Champs obligatoires
          </span>
        </p>

        {error && (
          <div
            className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4"
            role="alert"
          >
            <p>{error}</p>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-6 max-h-[70vh] overflow-y-auto pr-2"
        >
          {/* Section Information Société */}
          <fieldset className="border border-gray-300 p-4 rounded-md">
            <legend className="text-lg font-semibold text-sna-primary px-2">
              {renderSectionTitle("Information Société")}
            </legend>
            <p className="text-sm text-gray-500 mb-3">
              Informations légales de votre entreprise.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
              {renderInput("raisonSociale", "Raison Sociale", "text", true)}
              {renderInput("formeJuridique", "Forme Juridique")}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
              {renderInput("adresseSociete", "Adresse", "text", true)}
              {renderInput("codePostalSociete", "Code Postal", "text", true)}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
              {renderInput("villeSociete", "Ville", "text", true)}
              {renderCountrySelect("paysSociete", "Pays", true)}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
              {renderInput("siret", "SIRET")}
              {renderInput("numTVA", "Numéro de TVA")}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
              {renderInput("numEORI", "Numéro EORI")}
              {renderInput("capitalSocial", "Capital Social")}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
              {renderInput("codeAPE", "Code APE")}
              {renderInput("tvaIntracom", "TVA Intracommunautaire")}
            </div>
            <div className="grid grid-cols-1 gap-x-6">
              {renderInput(
                "iban",
                "IBAN",
                "text",
                true,
                "FR76 XXXX XXXX XXXX XXXX XXXX XXX"
              )}
            </div>
          </fieldset>

          {/* Section Contacts */}
          <fieldset className="border border-gray-300 p-4 rounded-md">
            <legend className="text-lg font-semibold text-sna-primary px-2">
              {renderSectionTitle("Contacts")}
            </legend>
            <p className="text-sm text-gray-500 mb-3">
              Veuillez fournir au moins un contact principal.
            </p>
            {/* Contact 1 */}
            <div className="border border-dashed border-gray-300 p-3 mb-4 rounded-md">
              <h4 className="font-medium text-gray-800 mb-2">
                Contact Principal
              </h4>
              {renderInput("contact1Nom", "Nom et Prénom", "text", true)}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                {renderInput("contact1Telephone", "Téléphone", "tel", true)}
                {renderInput("contact1Email", "Email", "email", true)}
              </div>
            </div>
            {/* Contact 2 */}
            <div className="border border-dashed border-gray-300 p-3 mb-4 rounded-md">
              <h4 className="font-medium text-gray-800 mb-2">
                Contact Secondaire (optionnel)
              </h4>
              {renderInput("contact2Nom", "Nom et Prénom")}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                {renderInput("contact2Telephone", "Téléphone", "tel")}
                {renderInput("contact2Email", "Email", "email")}
              </div>
            </div>
            {/* Contact Facturation */}
            <div className="border border-dashed border-gray-300 p-3 mb-4 rounded-md">
              <h4 className="font-medium text-gray-800 mb-2">
                Contact Facturation
              </h4>
              {renderInput("contactFacturationNom", "Nom et Prénom", "text")}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                {renderInput("contactFacturationTelephone", "Téléphone", "tel")}
                {renderInput("contactFacturationEmail", "Email", "email")}
              </div>
            </div>
            {renderInput(
              "emailRetourColis",
              "Email pour recevoir l'information de retour de colis",
              "email"
            )}
          </fieldset>

          {/* Section Soumission */}
          <fieldset className="border border-gray-300 p-4 rounded-md">
            <legend className="text-lg font-semibold text-sna-primary px-2">
              {renderSectionTitle("Validation")}
            </legend>
            <p className="text-sm text-gray-500 mb-3">
              Veuillez confirmer les informations en tant que représentant
              autorisé.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6">
              {renderInput(
                "dateSoumission",
                "Date de soumission",
                "date",
                true
              )}
              {renderInput("nomSoumission", "Nom du déclarant", "text", true)}
              {renderInput(
                "fonctionSoumission",
                "Fonction du déclarant",
                "text",
                true
              )}
            </div>
          </fieldset>

          <div className="mt-8 flex justify-end space-x-3">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary disabled:opacity-50"
              >
                Annuler (temporaire)
              </button>
            )}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full sm:w-auto px-8 py-3 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-sna-primary hover:bg-sna-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary transition-all duration-200 transform hover:scale-105"
            >
              {isLoading
                ? "Soumission en cours..."
                : "Enregistrer et continuer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default WelcomeForm;

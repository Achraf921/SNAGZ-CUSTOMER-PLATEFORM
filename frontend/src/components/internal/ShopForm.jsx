import React, { useState } from "react";

const ShopForm = ({ shop, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: shop?.name || "",
    description: shop?.description || "",
    clientName: shop?.clientName || "",
    clientEmail: shop?.clientEmail || "",
    clientPhone: shop?.clientPhone || "",
    siret: shop?.siret || "",
    tvaNumber: shop?.tvaNumber || "",
    colors: shop?.colors || [],
    fonts: shop?.fonts || [],
    logo: shop?.logo || null,
    bannerDesktop: shop?.bannerDesktop || null,
    bannerMobile: shop?.bannerMobile || null,
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    // Simulate API call
    setTimeout(() => {
      setIsLoading(false);
      onSave(formData);
      onClose();
    }, 1000);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleFileChange = (e) => {
    const { name, files } = e.target;
    if (files && files[0]) {
      setFormData((prev) => ({
        ...prev,
        [name]: files[0],
      }));
    }
  };

  const handleColorChange = (e, index) => {
    const newColors = [...formData.colors];
    newColors[index] = e.target.value;
    setFormData((prev) => ({
      ...prev,
      colors: newColors,
    }));
  };

  const addColor = () => {
    setFormData((prev) => ({
      ...prev,
      colors: [...prev.colors, "#000000"],
    }));
  };

  const removeColor = (index) => {
    setFormData((prev) => ({
      ...prev,
      colors: prev.colors.filter((_, i) => i !== index),
    }));
  };

  const handleFontChange = (e, index) => {
    const newFonts = [...formData.fonts];
    newFonts[index] = e.target.value;
    setFormData((prev) => ({
      ...prev,
      fonts: newFonts,
    }));
  };

  const addFont = () => {
    setFormData((prev) => ({
      ...prev,
      fonts: [...prev.fonts, ""],
    }));
  };

  const removeFont = (index) => {
    setFormData((prev) => ({
      ...prev,
      fonts: prev.fonts.filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center pt-16">
      <div
        className="absolute inset-0 pointer-events-none"
        onClick={onClose}
      ></div>
      <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full p-6 max-h-[calc(100vh-8rem)] overflow-y-auto my-4">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            Modifier la boutique
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
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

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Information */}
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-gray-900">
              Informations générales
            </h3>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-gray-700"
                >
                  Nom de la boutique
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="description"
                  className="block text-sm font-medium text-gray-700"
                >
                  Description
                </label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={3}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
                  required
                />
              </div>
            </div>
          </div>

          {/* Client Information */}
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-gray-900">
              Informations client
            </h3>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="clientName"
                  className="block text-sm font-medium text-gray-700"
                >
                  Nom du client
                </label>
                <input
                  type="text"
                  id="clientName"
                  name="clientName"
                  value={formData.clientName}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="clientEmail"
                  className="block text-sm font-medium text-gray-700"
                >
                  Email du client
                </label>
                <input
                  type="email"
                  id="clientEmail"
                  name="clientEmail"
                  value={formData.clientEmail}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="clientPhone"
                  className="block text-sm font-medium text-gray-700"
                >
                  Téléphone du client
                </label>
                <input
                  type="tel"
                  id="clientPhone"
                  name="clientPhone"
                  value={formData.clientPhone}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
                  required
                />
              </div>
            </div>
          </div>

          {/* Legal Information */}
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-gray-900">
              Informations légales
            </h3>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="siret"
                  className="block text-sm font-medium text-gray-700"
                >
                  SIRET
                </label>
                <input
                  type="text"
                  id="siret"
                  name="siret"
                  value={formData.siret}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="tvaNumber"
                  className="block text-sm font-medium text-gray-700"
                >
                  Numéro de TVA
                </label>
                <input
                  type="text"
                  id="tvaNumber"
                  name="tvaNumber"
                  value={formData.tvaNumber}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
                  required
                />
              </div>
            </div>
          </div>

          {/* Branding */}
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-gray-900">
              Branding & Design
            </h3>

            {/* Colors */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Couleurs
              </label>
              <div className="space-y-2">
                {formData.colors.map((color, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => handleColorChange(e, index)}
                      className="h-8 w-8 rounded border border-gray-300"
                    />
                    <button
                      type="button"
                      onClick={() => removeColor(index)}
                      className="text-red-600 hover:text-red-700"
                    >
                      Supprimer
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addColor}
                  className="text-sna-primary hover:text-sna-primary/90"
                >
                  + Ajouter une couleur
                </button>
              </div>
            </div>

            {/* Fonts */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Polices
              </label>
              <div className="space-y-2">
                {formData.fonts.map((font, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={font}
                      onChange={(e) => handleFontChange(e, index)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
                      placeholder="Nom de la police"
                    />
                    <button
                      type="button"
                      onClick={() => removeFont(index)}
                      className="text-red-600 hover:text-red-700"
                    >
                      Supprimer
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addFont}
                  className="text-sna-primary hover:text-sna-primary/90"
                >
                  + Ajouter une police
                </button>
              </div>
            </div>

            {/* Media */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Logo
                </label>
                <input
                  type="file"
                  name="logo"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-sna-primary/10 file:text-sna-primary hover:file:bg-sna-primary/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Bannière Desktop
                </label>
                <input
                  type="file"
                  name="bannerDesktop"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-sna-primary/10 file:text-sna-primary hover:file:bg-sna-primary/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Bannière Mobile
                </label>
                <input
                  type="file"
                  name="bannerMobile"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-sna-primary/10 file:text-sna-primary hover:file:bg-sna-primary/20"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-sna-primary hover:bg-sna-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary disabled:opacity-50"
            >
              {isLoading ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ShopForm;

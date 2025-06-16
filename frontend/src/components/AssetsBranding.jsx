import React from "react";

const AssetsBranding = ({
  formData,
  handleChange,
  handleArrayChange,
  addArrayItem,
  removeArrayItem,
}) => {
  const handleFileChange = (e, field) => {
    const file = e.target.files[0];
    if (file) {
      handleChange({
        target: {
          name: field,
          value: file,
        },
      });
    }
  };

  const handleColorAdd = () => {
    addArrayItem("colors", { name: "", hex: "#000000" });
  };

  const handleFontAdd = () => {
    addArrayItem("fonts", { name: "", url: "" });
  };

  const handleImageAdd = () => {
    addArrayItem("images", { name: "", file: null });
  };

  const handleItemChange = (arrayName, index, field, value) => {
    const newArray = [...(formData[arrayName] || [])];
    newArray[index] = {
      ...newArray[index],
      [field]: value,
    };
    handleArrayChange(arrayName, newArray);
  };

  const renderEmptyState = (message) => (
    <div className="text-center py-12 bg-gray-50 rounded-lg">
      <p className="text-gray-500">{message}</p>
    </div>
  );

  return (
    <div className="space-y-6 p-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Assets & Branding
        </h3>
        <p className="text-sm text-gray-500 mb-6">
          Personnalisez l'apparence de votre boutique avec vos éléments de
          marque.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Logo
          </label>
          <div className="mt-1 flex items-center">
            <input
              type="file"
              name="logo"
              accept="image/*"
              onChange={(e) => handleFileChange(e, "logo")}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-sna-primary/10 file:text-sna-primary hover:file:bg-sna-primary/20"
            />
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Format recommandé : PNG ou SVG, taille maximale : 2MB
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Bannière Desktop
          </label>
          <div className="mt-1 flex items-center">
            <input
              type="file"
              name="bannerDesktop"
              accept="image/*"
              onChange={(e) => handleFileChange(e, "bannerDesktop")}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-sna-primary/10 file:text-sna-primary hover:file:bg-sna-primary/20"
            />
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Format recommandé : JPG ou PNG, dimensions : 1920x400px
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Bannière Mobile
          </label>
          <div className="mt-1 flex items-center">
            <input
              type="file"
              name="bannerMobile"
              accept="image/*"
              onChange={(e) => handleFileChange(e, "bannerMobile")}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-sna-primary/10 file:text-sna-primary hover:file:bg-sna-primary/20"
            />
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Format recommandé : JPG ou PNG, dimensions : 768x300px
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Couleurs de la marque
          </label>
          <div className="mt-2 space-y-2">
            {formData.colors.map((color, index) => (
              <div key={index} className="flex items-center space-x-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => {
                    const newColors = [...formData.colors];
                    newColors[index] = e.target.value;
                    handleArrayChange("colors", newColors);
                  }}
                  className="h-8 w-8 rounded-md border border-gray-300"
                />
                <input
                  type="text"
                  value={color}
                  onChange={(e) => {
                    const newColors = [...formData.colors];
                    newColors[index] = e.target.value;
                    handleArrayChange("colors", newColors);
                  }}
                  className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
                  placeholder="#000000"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                handleArrayChange("colors", [...formData.colors, "#000000"])
              }
              className="mt-2 inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-sna-primary bg-sna-primary/10 hover:bg-sna-primary/20"
            >
              + Ajouter une couleur
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Polices de caractères
          </label>
          <div className="mt-2 space-y-2">
            {formData.fonts.map((font, index) => (
              <div key={index} className="flex items-center space-x-2">
                <input
                  type="text"
                  value={font}
                  onChange={(e) => {
                    const newFonts = [...formData.fonts];
                    newFonts[index] = e.target.value;
                    handleArrayChange("fonts", newFonts);
                  }}
                  className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
                  placeholder="Ex: Helvetica Neue"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                handleArrayChange("fonts", [...formData.fonts, ""])
              }
              className="mt-2 inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-sna-primary bg-sna-primary/10 hover:bg-sna-primary/20"
            >
              + Ajouter une police
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssetsBranding;

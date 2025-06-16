import React from "react";

const ReseauxSociaux = ({
  formData,
  handleArrayChange,
  addArrayItem,
  removeArrayItem,
}) => {
  const socialMediaPlatforms = [
    { name: "Instagram", urlPrefix: "https://instagram.com/" },
    { name: "Facebook", urlPrefix: "https://facebook.com/" },
    { name: "Twitter", urlPrefix: "https://twitter.com/" },
    { name: "TikTok", urlPrefix: "https://tiktok.com/@" },
    { name: "YouTube", urlPrefix: "https://youtube.com/" },
    { name: "LinkedIn", urlPrefix: "https://linkedin.com/in/" },
    { name: "Snapchat", urlPrefix: "https://snapchat.com/add/" },
    { name: "Pinterest", urlPrefix: "https://pinterest.com/" },
    { name: "SoundCloud", urlPrefix: "https://soundcloud.com/" },
    { name: "Twitch", urlPrefix: "https://twitch.tv/" },
    { name: "Autre", urlPrefix: "" },
  ];

  const handleSocialAdd = () => {
    addArrayItem("socialMedia", {
      platform: socialMediaPlatforms[0].name,
      url: socialMediaPlatforms[0].urlPrefix,
      username: "",
    });
  };

  const handleSocialChange = (index, field, value) => {
    const newSocialMedia = [...(formData.socialMedia || [])];

    if (field === "platform") {
      const platform = socialMediaPlatforms.find((p) => p.name === value);
      newSocialMedia[index] = {
        ...newSocialMedia[index],
        platform: value,
        url: platform.urlPrefix + (newSocialMedia[index].username || ""),
      };
    } else if (field === "username") {
      const platform = socialMediaPlatforms.find(
        (p) => p.name === newSocialMedia[index].platform
      );
      newSocialMedia[index] = {
        ...newSocialMedia[index],
        username: value,
        url: platform.urlPrefix + value,
      };
    } else {
      newSocialMedia[index] = {
        ...newSocialMedia[index],
        [field]: value,
      };
    }

    handleArrayChange("socialMedia", newSocialMedia);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">Réseaux Sociaux</h3>
        <button
          type="button"
          onClick={handleSocialAdd}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-sna-primary hover:bg-sna-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 mr-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Ajouter un réseau social
        </button>
      </div>

      <div className="space-y-4">
        {formData.socialMedia?.map((social, index) => (
          <div
            key={index}
            className="flex items-center space-x-4 bg-white p-4 rounded-md border border-gray-200"
          >
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Plateforme
              </label>
              <select
                value={social.platform}
                onChange={(e) =>
                  handleSocialChange(index, "platform", e.target.value)
                }
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
              >
                {socialMediaPlatforms.map((platform) => (
                  <option key={platform.name} value={platform.name}>
                    {platform.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {social.platform === "Autre"
                  ? "URL complète"
                  : "Nom d'utilisateur"}
              </label>
              {social.platform === "Autre" ? (
                <input
                  type="url"
                  value={social.url}
                  onChange={(e) =>
                    handleSocialChange(index, "url", e.target.value)
                  }
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
                  placeholder="https://..."
                />
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    value={social.username || ""}
                    onChange={(e) =>
                      handleSocialChange(index, "username", e.target.value)
                    }
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
                    placeholder={`Nom d'utilisateur ${social.platform}`}
                  />
                  <div className="mt-1 text-xs text-gray-500 truncate">
                    {social.url}
                  </div>
                </div>
              )}
            </div>

            <div className="flex-shrink-0 self-end">
              <button
                type="button"
                onClick={() => removeArrayItem("socialMedia", index)}
                className="inline-flex items-center p-2 border border-transparent rounded-md text-red-600 hover:bg-red-50"
                title="Supprimer ce réseau social"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>
        ))}

        {(!formData.socialMedia || formData.socialMedia.length === 0) && (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <p className="text-gray-500">
              Aucun réseau social ajouté. Cliquez sur "Ajouter un réseau social"
              pour commencer.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReseauxSociaux;

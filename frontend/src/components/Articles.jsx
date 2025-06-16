import React from "react";

const Articles = ({
  formData,
  handleChange,
  handleArrayChange,
  addArrayItem,
  removeArrayItem,
}) => {
  const productTypes = ["T-shirt", "Vinyle", "CD", "Autres"];

  const handleArticleChange = (index, field, value) => {
    const newArticles = [...(formData.articles || [])];
    newArticles[index] = {
      ...newArticles[index],
      [field]: value,
    };
    handleArrayChange("articles", newArticles);
  };

  const addArticle = () => {
    addArrayItem("articles", {
      title: "",
      description: "",
      productType: "T-shirt",
      quantity: 0,
      weight: 0,
      price: 0,
      releaseDate: "",
      artist: "",
      media: [], // Initialize empty media array
    });
  };

  const handleMediaAdd = (articleIndex) => {
    const newArticles = [...(formData.articles || [])];
    newArticles[articleIndex].media = [
      ...(newArticles[articleIndex].media || []),
      { file: null, type: "image", name: "" },
    ];
    handleArrayChange("articles", newArticles);
  };

  const handleMediaChange = (articleIndex, mediaIndex, field, value) => {
    const newArticles = [...(formData.articles || [])];
    const article = newArticles[articleIndex];
    const newMedia = [...(article.media || [])];

    newMedia[mediaIndex] = {
      ...newMedia[mediaIndex],
      [field]: value,
    };

    article.media = newMedia;
    handleArrayChange("articles", newArticles);
  };

  const removeMedia = (articleIndex, mediaIndex) => {
    const newArticles = [...(formData.articles || [])];
    const article = newArticles[articleIndex];
    article.media = article.media.filter((_, index) => index !== mediaIndex);
    handleArrayChange("articles", newArticles);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">Articles</h3>
        <button
          type="button"
          onClick={addArticle}
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
          Ajouter un article
        </button>
      </div>

      <div className="space-y-6">
        {formData.articles && formData.articles.length > 0 ? (
          formData.articles.map((article, articleIndex) => (
            <div
              key={articleIndex}
              className="bg-gray-50 p-6 rounded-lg relative border border-gray-200"
            >
              <button
                type="button"
                onClick={() => removeArrayItem("articles", articleIndex)}
                className="absolute top-4 right-4 text-gray-400 hover:text-red-500"
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

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Titre
                  </label>
                  <input
                    type="text"
                    value={article.title}
                    onChange={(e) =>
                      handleArticleChange(articleIndex, "title", e.target.value)
                    }
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Description
                  </label>
                  <textarea
                    value={article.description}
                    onChange={(e) =>
                      handleArticleChange(
                        articleIndex,
                        "description",
                        e.target.value
                      )
                    }
                    rows={3}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Type de produit
                  </label>
                  <select
                    value={article.productType}
                    onChange={(e) =>
                      handleArticleChange(
                        articleIndex,
                        "productType",
                        e.target.value
                      )
                    }
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
                  >
                    {productTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Quantité totale
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={article.quantity}
                    onChange={(e) =>
                      handleArticleChange(
                        articleIndex,
                        "quantity",
                        parseInt(e.target.value) || 0
                      )
                    }
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Poids (en grammes)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={article.weight}
                    onChange={(e) =>
                      handleArticleChange(
                        articleIndex,
                        "weight",
                        parseFloat(e.target.value) || 0
                      )
                    }
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Prix de vente TTC (€)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={article.price}
                    onChange={(e) =>
                      handleArticleChange(
                        articleIndex,
                        "price",
                        parseFloat(e.target.value) || 0
                      )
                    }
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Date de sortie
                  </label>
                  <input
                    type="date"
                    value={article.releaseDate}
                    onChange={(e) =>
                      handleArticleChange(
                        articleIndex,
                        "releaseDate",
                        e.target.value
                      )
                    }
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Artiste/Société
                  </label>
                  <input
                    type="text"
                    value={article.artist}
                    onChange={(e) =>
                      handleArticleChange(
                        articleIndex,
                        "artist",
                        e.target.value
                      )
                    }
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
                  />
                </div>

                {/* Media Section */}
                <div className="col-span-2 border-t border-gray-200 pt-4 mt-4">
                  <div className="flex justify-between items-center mb-4">
                    <label className="block text-sm font-medium text-gray-700">
                      Médias (Images & GIFs)
                    </label>
                    <button
                      type="button"
                      onClick={() => handleMediaAdd(articleIndex)}
                      className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-sna-primary bg-sna-primary/10 hover:bg-sna-primary/20"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4 mr-1"
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
                      Ajouter un média
                    </button>
                  </div>

                  <div className="space-y-3">
                    {article.media && article.media.length > 0 ? (
                      article.media.map((media, mediaIndex) => (
                        <div
                          key={mediaIndex}
                          className="flex items-center space-x-4 bg-white p-3 rounded-md border border-gray-200"
                        >
                          <div className="flex-1">
                            <input
                              type="text"
                              placeholder="Nom du média"
                              value={media.name}
                              onChange={(e) =>
                                handleMediaChange(
                                  articleIndex,
                                  mediaIndex,
                                  "name",
                                  e.target.value
                                )
                              }
                              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary text-sm"
                            />
                          </div>
                          <div className="flex-1">
                            <select
                              value={media.type}
                              onChange={(e) =>
                                handleMediaChange(
                                  articleIndex,
                                  mediaIndex,
                                  "type",
                                  e.target.value
                                )
                              }
                              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary text-sm"
                            >
                              <option value="image">Image</option>
                              <option value="gif">GIF</option>
                            </select>
                          </div>
                          <div className="flex-1">
                            <input
                              type="file"
                              accept={
                                media.type === "gif" ? "image/gif" : "image/*"
                              }
                              onChange={(e) => {
                                const file = e.target.files[0];
                                handleMediaChange(
                                  articleIndex,
                                  mediaIndex,
                                  "file",
                                  file
                                );
                              }}
                              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-sna-primary/10 file:text-sna-primary hover:file:bg-sna-primary/20"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              removeMedia(articleIndex, mediaIndex)
                            }
                            className="text-gray-400 hover:text-red-500"
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
                      ))
                    ) : (
                      <div className="text-center py-6 bg-white rounded-md border border-gray-200">
                        <p className="text-gray-500 text-sm">
                          Aucun média ajouté. Cliquez sur "Ajouter un média"
                          pour commencer.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <p className="text-gray-500">
              Aucun article ajouté. Cliquez sur "Ajouter un article" pour
              commencer.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Articles;

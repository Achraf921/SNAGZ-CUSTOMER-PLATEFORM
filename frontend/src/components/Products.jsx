import React from "react";

const Products = ({
  formData,
  handleArrayChange,
  addArrayItem,
  removeArrayItem,
}) => {
  const productTypes = ["T-shirt", "Vinyle", "CD", "Autres"];

  const handleProductAdd = () => {
    addArrayItem("products", {
      title: "",
      description: "",
      productType: "T-shirt",
      price: 0,
      quantity: 0,
      weight: 0,
      releaseDate: "",
      artist: "",
      media: [],
    });
  };

  const handleProductChange = (index, field, value) => {
    const newProducts = [...formData.products];
    newProducts[index] = {
      ...newProducts[index],
      [field]: value,
    };
    handleArrayChange("products", newProducts);
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Produits</h3>
        <p className="text-sm text-gray-500 mb-6">
          Ajoutez les produits que vous souhaitez vendre dans votre boutique.
        </p>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleProductAdd}
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
          Ajouter un produit
        </button>
      </div>

      <div className="space-y-6">
        {formData.products?.map((product, index) => (
          <div
            key={index}
            className="bg-white p-6 rounded-lg border border-gray-200 space-y-6"
          >
            <div className="flex justify-between items-start">
              <h4 className="text-lg font-medium text-gray-900">
                Produit #{index + 1}
              </h4>
              <button
                type="button"
                onClick={() => removeArrayItem("products", index)}
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

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Titre
                </label>
                <input
                  type="text"
                  value={product.title}
                  onChange={(e) =>
                    handleProductChange(index, "title", e.target.value)
                  }
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
                  placeholder="Ex: T-shirt Vamp Security"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Type de produit
                </label>
                <select
                  value={product.productType}
                  onChange={(e) =>
                    handleProductChange(index, "productType", e.target.value)
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

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">
                  Description
                </label>
                <textarea
                  value={product.description}
                  onChange={(e) =>
                    handleProductChange(index, "description", e.target.value)
                  }
                  rows={3}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
                  placeholder="Décrivez votre produit..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Prix (€)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={product.price}
                  onChange={(e) =>
                    handleProductChange(
                      index,
                      "price",
                      parseFloat(e.target.value)
                    )
                  }
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Quantité
                </label>
                <input
                  type="number"
                  min="0"
                  value={product.quantity}
                  onChange={(e) =>
                    handleProductChange(
                      index,
                      "quantity",
                      parseInt(e.target.value)
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
                  value={product.weight}
                  onChange={(e) =>
                    handleProductChange(
                      index,
                      "weight",
                      parseInt(e.target.value)
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
                  value={product.releaseDate}
                  onChange={(e) =>
                    handleProductChange(index, "releaseDate", e.target.value)
                  }
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Artiste/Société
                </label>
                <input
                  type="text"
                  value={product.artist}
                  onChange={(e) =>
                    handleProductChange(index, "artist", e.target.value)
                  }
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
                  placeholder="Ex: Playboi Carti"
                />
              </div>
            </div>
          </div>
        ))}

        {(!formData.products || formData.products.length === 0) && (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <p className="text-gray-500">
              Aucun produit ajouté. Cliquez sur "Ajouter un produit" pour
              commencer.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Products;

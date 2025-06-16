import React, { useState } from "react";

const Statistics = () => {
  // Demo data - replace with actual API call
  const [stats] = useState({
    totalClients: 25,
    totalShops: 45,
    totalProducts: 1250,
    totalOrders: 3500,
    totalRevenue: 750000,
    activeShops: 38,
    pendingShops: 7,
    averageOrderValue: 214,
  });

  const cards = [
    {
      title: "Clients",
      value: stats.totalClients,
      unit: "",
      description: "Clients actifs sur la plateforme",
    },
    {
      title: "Boutiques",
      value: stats.totalShops,
      unit: "",
      description: `${stats.activeShops} actives, ${stats.pendingShops} en attente`,
    },
    {
      title: "Produits",
      value: stats.totalProducts,
      unit: "",
      description: "Produits en vente",
    },
    {
      title: "Commandes",
      value: stats.totalOrders,
      unit: "",
      description: "Commandes traitées",
    },
    {
      title: "Chiffre d'affaires",
      value: stats.totalRevenue,
      unit: "€",
      description: "Chiffre d'affaires total",
    },
    {
      title: "Panier moyen",
      value: stats.averageOrderValue,
      unit: "€",
      description: "Valeur moyenne des commandes",
    },
  ];

  return (
    <div>
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">Statistiques</h1>
          <p className="mt-2 text-sm text-gray-700">
            Vue d'ensemble des performances de la plateforme
          </p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.title}
            className="bg-white overflow-hidden shadow rounded-lg"
          >
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="ml-5 w-0 flex-1">
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      {card.title}
                    </dt>
                    <dd className="flex items-baseline">
                      <div className="text-2xl font-semibold text-gray-900">
                        {card.unit === "€"
                          ? `${card.value.toLocaleString()}${card.unit}`
                          : `${card.value.toLocaleString()}`}
                      </div>
                    </dd>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        {card.description}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add charts and more detailed statistics here */}
    </div>
  );
};

export default Statistics;

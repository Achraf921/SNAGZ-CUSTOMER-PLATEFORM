import React, { useState, useEffect } from "react";
import {
  FaUsers,
  FaStore,
  FaCube,
  FaShopify,
  FaChartLine,
  FaCheckCircle,
  FaClock,
  FaExclamationTriangle,
  FaEuroSign,
  FaCalendarAlt,
  FaFileAlt,
  FaArrowUp,
  FaArrowDown,
} from "react-icons/fa";

const Statistics = () => {
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Fetch statistics from backend
  useEffect(() => {
    fetchStatistics();
  }, []);

  const fetchStatistics = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/statistics");
      const data = await response.json();

      if (data.success) {
        setStats(data.statistics);
        setLastUpdated(new Date(data.generatedAt));
        console.log("📊 Statistics loaded:", data.statistics);
      } else {
        throw new Error(data.message || "Failed to fetch statistics");
      }
    } catch (err) {
      console.error("❌ Error fetching statistics:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Main KPI Cards
  const getMainKpiCards = () => {
    if (!stats) return [];

    return [
      {
        title: "Clients",
        value: stats.totalCustomers,
        icon: <FaUsers className="text-blue-500" />,
        description: `${stats.customers.active} actifs, ${stats.customers.pending} en attente`,
        trend: stats.recentActivity.newCustomers > 0 ? "up" : "stable",
        trendValue: stats.recentActivity.newCustomers,
        trendText: "nouveaux (30j)",
        bgGradient: "from-blue-50 to-blue-100",
        borderColor: "border-blue-200",
      },
      {
        title: "Boutiques",
        value: stats.totalShops,
        icon: <FaStore className="text-green-500" />,
        description: `${stats.shops.valid} validées, ${stats.shops.pending} en attente`,
        trend: stats.recentActivity.newShops > 0 ? "up" : "stable",
        trendValue: stats.recentActivity.newShops,
        trendText: "nouvelles (30j)",
        bgGradient: "from-green-50 to-green-100",
        borderColor: "border-green-200",
      },
      {
        title: "Produits",
        value: stats.totalProducts,
        icon: <FaCube className="text-purple-500" />,
        description: `${stats.products.active} actifs, ${stats.products.inactive} inactifs`,
        trend: stats.recentActivity.newProducts > 0 ? "up" : "stable",
        trendValue: stats.recentActivity.newProducts,
        trendText: "nouveaux (30j)",
        bgGradient: "from-purple-50 to-purple-100",
        borderColor: "border-purple-200",
      },
      {
        title: "Shopify",
        value: stats.shops.withShopify,
        icon: <FaShopify className="text-green-600" />,
        description: `${Math.round((stats.shops.withShopify / stats.totalShops) * 100)}% des boutiques`,
        subValue: `${stats.shops.parametrized} paramétrées`,
        bgGradient: "from-emerald-50 to-emerald-100",
        borderColor: "border-emerald-200",
      },
    ];
  };

  // Secondary metrics cards
  const getSecondaryCards = () => {
    if (!stats) return [];

    return [
      {
        title: "Taux de validation",
        value: `${Math.round((stats.shops.valid / stats.totalShops) * 100)}%`,
        icon: <FaCheckCircle className="text-green-500" />,
        description: "Boutiques validées",
        color: "green",
      },
      {
        title: "Documentation",
        value: `${Math.round((stats.shops.documented / stats.totalShops) * 100)}%`,
        icon: <FaFileAlt className="text-blue-500" />,
        description: "Boutiques documentées",
        color: "blue",
      },
      {
        title: "Type Vendeur",
        value: stats.paymentTypes.vendeur,
        icon: <FaEuroSign className="text-yellow-500" />,
        description: "Clients vendeurs",
        color: "yellow",
      },
      {
        title: "Type Mandataire",
        value: stats.paymentTypes.mandataire,
        icon: <FaUsers className="text-orange-500" />,
        description: "Clients mandataires",
        color: "orange",
      },
    ];
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-gray-600">
          Chargement des statistiques...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-center">
          <FaExclamationTriangle className="text-red-500 text-xl mr-3" />
          <div>
            <h3 className="text-red-800 font-medium">Erreur de chargement</h3>
            <p className="text-red-600 text-sm mt-1">{error}</p>
            <button
              onClick={fetchStatistics}
              className="mt-3 px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors text-sm"
            >
              Réessayer
            </button>
          </div>
        </div>
      </div>
    );
  }

  const mainCards = getMainKpiCards();
  const secondaryCards = getSecondaryCards();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tableau de Bord</h1>
          <p className="mt-2 text-gray-600">
            Vue d'ensemble des performances de la plateforme SNA
          </p>
          {lastUpdated && (
            <p className="text-sm text-gray-500 mt-1">
              <FaCalendarAlt className="inline mr-1" />
              Dernière mise à jour : {lastUpdated.toLocaleString("fr-FR")}
            </p>
          )}
        </div>
        <button
          onClick={fetchStatistics}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center"
        >
          <FaChartLine className="mr-2" />
          Actualiser
        </button>
      </div>

      {/* Main KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {mainCards.map((card, index) => (
          <div
            key={index}
            className={`bg-gradient-to-br ${card.bgGradient} border ${card.borderColor} rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-600">
                    {card.title}
                  </h3>
                  <div className="text-2xl">{card.icon}</div>
                </div>
                <div className="text-3xl font-bold text-gray-900 mb-2">
                  {card.value.toLocaleString()}
                </div>
                <p className="text-sm text-gray-600 mb-3">{card.description}</p>
                {card.subValue && (
                  <p className="text-xs text-gray-500">{card.subValue}</p>
                )}
                {card.trend && (
                  <div className="flex items-center mt-3 text-xs">
                    {card.trend === "up" ? (
                      <FaArrowUp className="text-green-500 mr-1" />
                    ) : (
                      <FaArrowDown className="text-gray-400 mr-1" />
                    )}
                    <span
                      className={
                        card.trend === "up" ? "text-green-600" : "text-gray-500"
                      }
                    >
                      +{card.trendValue} {card.trendText}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {secondaryCards.map((card, index) => (
          <div
            key={index}
            className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-600">
                {card.title}
              </h3>
              <div className="text-xl">{card.icon}</div>
            </div>
            <div className="text-2xl font-bold text-gray-900 mb-2">
              {typeof card.value === "number"
                ? card.value.toLocaleString()
                : card.value}
            </div>
            <p className="text-sm text-gray-500">{card.description}</p>
          </div>
        ))}
      </div>

      {/* Detailed Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Shop Status Breakdown */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
            <FaStore className="mr-3 text-green-500" />
            Répartition des Boutiques
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
              <span className="flex items-center">
                <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
                Validées
              </span>
              <span className="font-semibold text-green-700">
                {stats.shops.valid}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-yellow-50 rounded-lg">
              <span className="flex items-center">
                <div className="w-3 h-3 bg-yellow-500 rounded-full mr-3"></div>
                En attente
              </span>
              <span className="font-semibold text-yellow-700">
                {stats.shops.pending}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="flex items-center">
                <div className="w-3 h-3 bg-gray-500 rounded-full mr-3"></div>
                Inactives
              </span>
              <span className="font-semibold text-gray-700">
                {stats.shops.inactive}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
              <span className="flex items-center">
                <div className="w-3 h-3 bg-blue-500 rounded-full mr-3"></div>
                Avec Shopify
              </span>
              <span className="font-semibold text-blue-700">
                {stats.shops.withShopify}
              </span>
            </div>
          </div>
        </div>

        {/* Product Status Breakdown */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
            <FaCube className="mr-3 text-purple-500" />
            Répartition des Produits
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
              <span className="flex items-center">
                <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
                Actifs
              </span>
              <span className="font-semibold text-green-700">
                {stats.products.active}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="flex items-center">
                <div className="w-3 h-3 bg-gray-500 rounded-full mr-3"></div>
                Inactifs
              </span>
              <span className="font-semibold text-gray-700">
                {stats.products.inactive}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
              <span className="flex items-center">
                <div className="w-3 h-3 bg-blue-500 rounded-full mr-3"></div>
                Avec Shopify
              </span>
              <span className="font-semibold text-blue-700">
                {stats.products.withShopify}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg">
              <span className="flex items-center">
                <div className="w-3 h-3 bg-purple-500 rounded-full mr-3"></div>
                Avec EC
              </span>
              <span className="font-semibold text-purple-700">
                {stats.products.withEC}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity Summary */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <FaClock className="mr-3 text-blue-500" />
          Activité Récente (30 derniers jours)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {stats.recentActivity.newCustomers}
            </div>
            <div className="text-sm text-gray-600">Nouveaux clients</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {stats.recentActivity.newShops}
            </div>
            <div className="text-sm text-gray-600">Nouvelles boutiques</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {stats.recentActivity.newProducts}
            </div>
            <div className="text-sm text-gray-600">Nouveaux produits</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Statistics;

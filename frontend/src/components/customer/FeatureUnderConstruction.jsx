import React from "react";
import { FaHardHat } from "react-icons/fa";

const FeatureUnderConstruction = ({ returnPath = "/" }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 bg-white rounded-lg shadow">
      <FaHardHat className="w-24 h-24 text-yellow-500 mb-6" />
      <h2 className="text-3xl font-semibold text-gray-700 mb-3">
        Fonctionnalité en Construction
      </h2>
      <p className="text-gray-600 text-center max-w-md">
        Nous travaillons activement sur cette section. Elle sera bientôt
        disponible !
      </p>
      <p className="text-gray-500 text-sm mt-4">Merci de votre patience.</p>
      <a
        href={returnPath}
        className="mt-8 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow hover:bg-blue-700 transition-colors"
      >
        Retour à la page précédente
      </a>
    </div>
  );
};

export default FeatureUnderConstruction;

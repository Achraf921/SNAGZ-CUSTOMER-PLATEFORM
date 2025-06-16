import React from "react";
import logo from "../assets/logo.png";

const Header = () => {
  return (
    <header className="bg-white shadow-lg absolute top-0 left-0 right-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <img
              src={logo}
              alt="SNA GZ"
              className="h-12 w-auto"
              style={{ objectFit: "contain" }}
            />
            <div className="ml-4 border-l-2 border-sna-gray pl-4">
              <h1 className="text-xl font-heading font-semibold text-sna-dark">
                Création de Boutique
              </h1>
              <p className="text-sm text-gray-500">
                Formulaire de configuration
              </p>
            </div>
          </div>
          <div className="hidden sm:block">
            <div className="bg-sna-gray/10 px-4 py-2 rounded-sna">
              <span className="text-sm text-sna-primary font-medium">
                Support technique : support@snagz.com
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;

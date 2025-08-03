import React from "react";

const OuNousTrouver = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow-lg rounded-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">
            Où nous trouver
          </h1>

          <div className="prose max-w-none text-gray-700 space-y-8">
            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                Bureaux
              </h2>
              <div className="bg-green-50 p-6 rounded-lg">
                <p className="text-lg leading-relaxed mb-6">
                  <strong>Nous contacter</strong>
                  <br />
                  Contactez nous dès maintenant pour échanger sur vos besoins ou
                  demander un devis
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-white p-6 rounded-lg shadow-sm">
                    <h3 className="text-xl font-semibold text-gray-900 mb-4">
                      <svg
                        className="w-6 h-6 inline mr-2 text-green-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                      Adresse
                    </h3>
                    <p className="text-gray-700 text-lg">
                      Bureau Paris - 171 Quai de Valmy
                      <br />
                      75010 Paris
                    </p>
                  </div>

                  <div className="bg-white p-6 rounded-lg shadow-sm">
                    <h3 className="text-xl font-semibold text-gray-900 mb-4">
                      <svg
                        className="w-6 h-6 inline mr-2 text-green-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                        />
                      </svg>
                      Téléphone
                    </h3>
                    <p className="text-gray-700 text-lg">
                      <a
                        href="tel:0140386130"
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        01 40 38 61 30
                      </a>
                    </p>

                    <h3 className="text-xl font-semibold text-gray-900 mb-4 mt-6">
                      <svg
                        className="w-6 h-6 inline mr-2 text-green-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                        />
                      </svg>
                      Email
                    </h3>
                    <p className="text-gray-700 text-lg">
                      <a
                        href="mailto:contact@sna-gz.com"
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        contact@sna-gz.com
                      </a>
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                Horaires d'ouverture
              </h2>
              <div className="bg-blue-50 p-6 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                      Lundi - Vendredi
                    </h3>
                    <p className="text-gray-700">9h00 - 18h00</p>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                      Samedi - Dimanche
                    </h3>
                    <p className="text-gray-700 text-red-600 font-medium">
                      Fermé
                    </p>
                  </div>
                </div>
                <p className="text-gray-600 mt-4 text-sm">
                  * Horaires sur rendez-vous pour les consultations
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                Comment nous rejoindre
              </h2>
              <div className="bg-gray-50 p-6 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="bg-white p-4 rounded-lg shadow-sm">
                      <svg
                        className="w-8 h-8 mx-auto mb-3 text-blue-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                        />
                      </svg>
                      <h3 className="font-semibold text-gray-900 mb-2">
                        Métro
                      </h3>
                      <p className="text-gray-700 text-sm">
                        Ligne 2, 5, 7bis
                        <br />
                        Station Jaurès
                      </p>
                      <p className="text-gray-700 text-sm mt-2">
                        Ligne 7<br />
                        Station Château-Landon
                      </p>
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="bg-white p-4 rounded-lg shadow-sm">
                      <svg
                        className="w-8 h-8 mx-auto mb-3 text-green-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <h3 className="font-semibold text-gray-900 mb-2">Bus</h3>
                      <p className="text-gray-700 text-sm">
                        Lignes 26, 48, 54
                        <br />
                        Arrêt Jaurès
                      </p>
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="bg-white p-4 rounded-lg shadow-sm">
                      <svg
                        className="w-8 h-8 mx-auto mb-3 text-purple-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-1.447-.894L15 4m0 13V4m-6 3l6-3"
                        />
                      </svg>
                      <h3 className="font-semibold text-gray-900 mb-2">Tram</h3>
                      <p className="text-gray-700 text-sm">
                        Ligne T3b
                        <br />
                        Arrêt Porte de Pantin
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OuNousTrouver;

import React from "react";

const QuiNousSommes = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow-lg rounded-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">
            Qui nous sommes
          </h1>

          <div className="prose max-w-none text-gray-700 space-y-8">
            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                À propos du développeur
              </h2>
              <div className="bg-blue-50 p-6 rounded-lg">
                <p className="text-lg leading-relaxed">
                  Bonjour ! Je suis <strong>Achraf Bayi</strong>, un développeur
                  de 19 ans né à Paris. Je poursuis actuellement mes études en
                  génie logiciel au Canada en 2ème année et j'effectue un stage
                  chez SNA GZ où j'ai eu l'opportunité de développer cette
                  plateforme innovante.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                À propos du projet
              </h2>
              <p className="text-lg leading-relaxed mb-4">
                Cette plateforme a été conçue pour révolutionner la création et
                la configuration de projets e-commerce. Elle permet aux clients
                de SNA GZ de gérer facilement leurs boutiques en ligne, leurs
                produits et leur processus de vente avec une interface moderne
                et intuitive.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                Stack technique utilisée
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    Frontend
                  </h3>
                  <ul className="space-y-2 text-gray-700">
                    <li>
                      • <strong>React.js</strong> - Framework JavaScript moderne
                    </li>
                    <li>
                      • <strong>Tailwind CSS</strong> - Framework CSS utilitaire
                    </li>
                    <li>
                      • <strong>Vite</strong> - Outil de build ultra-rapide
                    </li>
                    <li>
                      • <strong>React Hooks</strong> - Gestion d'état moderne
                    </li>
                  </ul>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    Backend
                  </h3>
                  <ul className="space-y-2 text-gray-700">
                    <li>
                      • <strong>Node.js</strong> - Environnement d'exécution
                      JavaScript
                    </li>
                    <li>
                      • <strong>Express.js</strong> - Framework web minimaliste
                    </li>
                    <li>
                      • <strong>MongoDB</strong> - Base de données NoSQL
                    </li>
                    <li>
                      • <strong>Mongoose</strong> - ODM pour MongoDB
                    </li>
                  </ul>
                </div>
              </div>

              <div className="bg-green-50 p-4 rounded-lg mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  Services et APIs intégrées
                </h3>
                <ul className="space-y-2 text-gray-700">
                  <li>
                    • <strong>AWS S3</strong> - Stockage cloud pour les images
                    et fichiers
                  </li>
                  <li>
                    • <strong>Shopify API</strong> - Intégration e-commerce
                    complète
                  </li>
                  <li>
                    • <strong>Amazon Cognito</strong> - Authentification et
                    gestion des utilisateurs
                  </li>
                  <li>
                    • <strong>Microsoft SharePoint API</strong> - Gestion
                    documentaire
                  </li>
                  <li>
                    • <strong>Nodemailer</strong> - Service d'envoi d'emails
                  </li>
                  <li>
                    • <strong>reCAPTCHA</strong> - Protection contre les bots
                  </li>
                </ul>
              </div>

              <div className="bg-purple-50 p-4 rounded-lg">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  Fonctionnalités avancées
                </h3>
                <ul className="space-y-2 text-gray-700">
                  <li>
                    • <strong>Authentification multi-niveaux</strong> - Client,
                    Interne, Admin
                  </li>
                  <li>
                    • <strong>Gestion d'images</strong> - Upload,
                    réorganisation, suppression
                  </li>
                  <li>
                    • <strong>Interface responsive</strong> - Compatible mobile
                    et desktop
                  </li>
                  <li>
                    • <strong>Validation en temps réel</strong> - Formulaires
                    intelligents
                  </li>
                  <li>
                    • <strong>Sécurité renforcée</strong> - Rate limiting,
                    validation des entrées
                  </li>
                  <li>
                    • <strong>Intégration Shopify</strong> - Synchronisation
                    automatique
                  </li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                Architecture du système
              </h2>
              <p className="text-lg leading-relaxed mb-4">
                L'application suit une architecture moderne en couches avec une
                séparation claire entre le frontend et le backend. Le frontend
                React communique avec une API REST sécurisée qui gère
                l'authentification, la validation des données et l'intégration
                avec les services externes.
              </p>
              <p className="text-lg leading-relaxed">
                La sécurité est une priorité avec l'implémentation de
                middlewares de validation, de rate limiting et de contrôles
                d'accès granulaires pour chaque endpoint.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                Connectons-nous !
              </h2>
              <div className="bg-blue-50 p-6 rounded-lg">
                <p className="text-lg leading-relaxed mb-4">
                  Vous souhaitez en savoir plus sur ce projet ou discuter de
                  développement ? N'hésitez pas à me contacter !
                </p>
                <a
                  href="https://www.linkedin.com/in/achrafbayi/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <svg
                    className="w-5 h-5 mr-2"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                  </svg>
                  Connectez-vous avec moi sur LinkedIn
                </a>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuiNousSommes;

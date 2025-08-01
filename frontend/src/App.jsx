import React, { Suspense, useEffect, lazy } from "react";
import Header from "./components/Header.jsx";
import Footer from "./components/Footer.jsx";
import MainPage from "./pages/MainPage.jsx";
import componentPreloader from "./utils/componentPreloader.js";

// Lazy load components for better code splitting
// Core layouts - load immediately since they're needed often
import ClientLayout from "./components/customer/ClientLayout.jsx";
import InternalLayout from "./components/internal/InternalLayout.jsx";
import AdminLayout from "./components/admin/AdminLayout.jsx";

// Customer components - lazy loaded
const CustomerDashboard = lazy(
  () => import("./components/customer/CustomerDashboard.jsx")
);
const MesBoutiques = lazy(
  () => import("./components/customer/MesBoutiques.jsx")
);
const CreateShop = lazy(() => import("./components/customer/CreateShop.jsx"));
const EditShop = lazy(() => import("./components/customer/EditShop.jsx"));
const CreateProduct = lazy(
  () => import("./components/customer/CreateProduct.jsx")
);
const MesProduits = lazy(() => import("./components/customer/MesProduits.jsx"));
const FeatureUnderConstruction = lazy(
  () => import("./components/customer/FeatureUnderConstruction.jsx")
);
const ManageAccount = lazy(
  () => import("./components/customer/ManageAccount.jsx")
);

// Auth components - lazy loaded
const ResetPasswordPage = lazy(
  () => import("./components/auth/ResetPasswordPage.jsx")
);

// Public pages - lazy loaded
const ConditionsGenerales = lazy(
  () => import("./components/pages/ConditionsGenerales.jsx")
);
const QuiNousSommes = lazy(
  () => import("./components/pages/QuiNousSommes.jsx")
);

// Internal components - lazy loaded by category
const ClientsList = lazy(() => import("./components/internal/ClientsList.jsx"));
const ClientDetails = lazy(
  () => import("./components/internal/ClientDetails.jsx")
);
const ClientShops = lazy(() => import("./components/internal/ClientShops.jsx"));
const ShopDetails = lazy(() => import("./components/internal/ShopDetails.jsx"));
const AllShops = lazy(() => import("./components/internal/AllShops.jsx"));
const BoutiquesAValider = lazy(
  () => import("./components/internal/BoutiquesAValider.jsx")
);
const ProduitsAValider = lazy(
  () => import("./components/internal/ProduitsAValider.jsx")
);
const Produits = lazy(() => import("./components/internal/Produits.jsx"));
const DocumentationSection = lazy(
  () => import("./components/internal/DocumentationSection.jsx")
);
const ClientsAValider = lazy(
  () => import("./components/internal/ClientsAValider.jsx")
);
const Statistics = lazy(() => import("./components/internal/Statistics.jsx"));
const InternalProfile = lazy(
  () => import("./components/internal/InternalProfile.jsx")
);

// Shopify components - separate chunk for specialized functionality
const ShopifyBoutiques = lazy(
  () => import("./pages/internal/ShopifyBoutiques.jsx")
);
const ShopifyConfiguration = lazy(
  () => import("./components/internal/shopify/ShopifyConfiguration.jsx")
);
const FicheProduitsShopify = lazy(
  () => import("./components/internal/shopify/FicheProduitsShopify.jsx")
);
const GenerationEC = lazy(
  () => import("./components/internal/shopify/GenerationEC.jsx")
);

// Admin components - lazy loaded
const AdminClientAccounts = lazy(
  () => import("./components/admin/AdminClientAccounts.jsx")
);
const AdminInternalAccounts = lazy(
  () => import("./components/admin/AdminInternalAccounts.jsx")
);
const AdminAccounts = lazy(
  () => import("./components/admin/AdminAccounts.jsx")
);
const AdminProfile = lazy(() => import("./components/admin/AdminProfile.jsx"));

// Loading component for Suspense fallback
const LoadingSpinner = () => (
  <div className="flex items-center justify-center min-h-64">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    <span className="ml-3 text-gray-600">Chargement...</span>
  </div>
);

// Error boundary for lazy loaded components
class LazyErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Lazy loading error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-64 p-8">
          <div className="text-red-600 text-xl mb-4">Erreur de chargement</div>
          <p className="text-gray-600 mb-4">
            Une erreur s'est produite lors du chargement de cette page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Recharger la page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Enhanced Suspense wrapper with error boundary
const LazyComponentWrapper = ({ children, fallback = <LoadingSpinner /> }) => (
  <LazyErrorBoundary>
    <Suspense fallback={fallback}>{children}</Suspense>
  </LazyErrorBoundary>
);

const App = () => {
  const { pathname } = window.location;

  // Initialize component preloading
  useEffect(() => {
    // Preload components based on current route
    componentPreloader.preloadByRoute(pathname);

    // Set up navigation change detection for future preloading
    const handlePopState = () => {
      const newPath = window.location.pathname;
      componentPreloader.preloadByRoute(newPath);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [pathname]);

  let ComponentToRender = MainPage; // Default to MainPage
  let LayoutComponent = ({ children }) => <>{children}</>; // Default no layout
  let pageProps = {}; // To pass props like IDs from path
  let requiresLazyLoading = false; // Flag to determine if component needs lazy loading

  // Helper to extract ID from path, e.g., /path/to/123 -> 123
  // Or /path/to/123/subpath/456 -> {id1: 123, id2: 456}
  const extractParams = (pathTemplate, currentPath) => {
    const templateParts = pathTemplate.split("/").filter((p) => p);
    const currentParts = currentPath.split("/").filter((p) => p);
    const params = {};
    templateParts.forEach((part, index) => {
      if (part.startsWith(":") && currentParts[index]) {
        params[part.substring(1)] = currentParts[index];
      }
    });
    return params;
  };

  if (pathname === "/") {
    ComponentToRender = MainPage;
  }
  // Auth Routes
  else if (pathname === "/reset-password") {
    ComponentToRender = ResetPasswordPage;
    requiresLazyLoading = true;
  }
  // Public Pages
  else if (pathname === "/conditions-generales") {
    ComponentToRender = ConditionsGenerales;
    requiresLazyLoading = true;
  } else if (pathname === "/qui-nous-sommes") {
    ComponentToRender = QuiNousSommes;
    requiresLazyLoading = true;
  }
  // Customer Routes
  else if (pathname === "/client/dashboard") {
    LayoutComponent = ClientLayout;
    ComponentToRender = CustomerDashboard;
    requiresLazyLoading = true;
  } else if (pathname === "/client/boutiques") {
    LayoutComponent = ClientLayout;
    ComponentToRender = MesBoutiques;
    pageProps = {};
    requiresLazyLoading = true;
  } else if (pathname === "/client/boutiques/create") {
    LayoutComponent = ClientLayout;
    ComponentToRender = CreateShop;
    requiresLazyLoading = true;
  } else if (pathname === "/client/produits") {
    LayoutComponent = ClientLayout;
    ComponentToRender = MesProduits;
    requiresLazyLoading = true;
  } else if (pathname === "/client/produits/create") {
    LayoutComponent = ClientLayout;
    ComponentToRender = CreateProduct;
    requiresLazyLoading = true;
  } else if (pathname.startsWith("/client/boutiques/edit/")) {
    LayoutComponent = ClientLayout;
    ComponentToRender = EditShop;
    const params = extractParams("/client/boutiques/edit/:shopId", pathname);
    pageProps = { shopId: params.shopId, returnPath: "/client/boutiques" };
    requiresLazyLoading = true;
  } else if (pathname === "/client/compte") {
    LayoutComponent = ClientLayout;
    ComponentToRender = ManageAccount;
    pageProps = { returnPath: "/client/dashboard" };
    requiresLazyLoading = true;
  } else if (pathname === "/client/login") {
    // Redirect authenticated users to compte, unauthenticated to main page
    const userInfo =
      sessionStorage.getItem("userInfo") || localStorage.getItem("userInfo");
    const isFirstLogin = sessionStorage.getItem("isFirstLogin") === "true";

    if (userInfo || isFirstLogin) {
      window.location.replace("/client/compte");
      return null;
    } else {
      window.location.replace("/");
      return null;
    }
  }
  // Internal Routes
  else if (pathname === "/internal/dashboard") {
    // Redirect to clients (default internal page)
    window.location.replace("/internal/clients");
    return null;
  } else if (pathname === "/internal/clients") {
    LayoutComponent = InternalLayout;
    ComponentToRender = ClientsList;
    requiresLazyLoading = true;
  } else if (pathname === "/internal/documentation") {
    LayoutComponent = InternalLayout;
    ComponentToRender = DocumentationSection;
    requiresLazyLoading = true;
  } else if (
    pathname.startsWith("/internal/clients/") &&
    pathname.endsWith("/boutiques") &&
    pathname.split("/").length === 5
  ) {
    LayoutComponent = InternalLayout;
    ComponentToRender = ClientShops;
    const params = extractParams(
      "/internal/clients/:clientId/boutiques",
      pathname
    );
    pageProps = { clientId: params.clientId };
    requiresLazyLoading = true;
  } else if (
    pathname.startsWith("/internal/clients/") &&
    pathname.split("/").length === 6 &&
    pathname.includes("/boutiques/")
  ) {
    LayoutComponent = InternalLayout;
    ComponentToRender = ShopDetails;
    const params = extractParams(
      "/internal/clients/:clientId/boutiques/:shopId",
      pathname
    );
    pageProps = { clientId: params.clientId, shopId: params.shopId };
    requiresLazyLoading = true;
  } else if (
    pathname.startsWith("/internal/clients/") &&
    (pathname.split("/").length === 4 ||
      (pathname.split("/").length === 5 && pathname.endsWith("/")))
  ) {
    // Handle /internal/clients/:clientId and /internal/clients/:clientId/
    LayoutComponent = InternalLayout;
    ComponentToRender = ClientDetails;
    // Remove trailing slash if present for param extraction
    const cleanPath = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
    const params = extractParams("/internal/clients/:clientId", cleanPath);
    pageProps = { clientId: params.clientId };
    requiresLazyLoading = true;
  } else if (pathname === "/internal/boutiques/nouvelle") {
    LayoutComponent = InternalLayout;
    ComponentToRender = CreateShop;
    requiresLazyLoading = true;
  } else if (pathname === "/internal/boutiques") {
    LayoutComponent = InternalLayout;
    ComponentToRender = AllShops;
    requiresLazyLoading = true;
  } else if (pathname === "/internal/produits") {
    LayoutComponent = InternalLayout;
    ComponentToRender = Produits;
    requiresLazyLoading = true;
  } else if (pathname === "/internal/boutiques-a-valider") {
    LayoutComponent = InternalLayout;
    ComponentToRender = BoutiquesAValider;
    requiresLazyLoading = true;
  } else if (pathname === "/internal/produits-a-valider") {
    LayoutComponent = InternalLayout;
    ComponentToRender = ProduitsAValider;
    requiresLazyLoading = true;
  } else if (pathname === "/internal/clients-a-valider") {
    LayoutComponent = InternalLayout;
    ComponentToRender = ClientsAValider;
    requiresLazyLoading = true;
  } else if (pathname === "/internal/profile") {
    LayoutComponent = InternalLayout;
    ComponentToRender = InternalProfile;
    requiresLazyLoading = true;
  } else if (pathname === "/internal/statistiques") {
    LayoutComponent = InternalLayout;
    ComponentToRender = Statistics;
    requiresLazyLoading = true;
  } else if (pathname === "/internal/shopify") {
    LayoutComponent = InternalLayout;
    ComponentToRender = ShopifyBoutiques;
    pageProps = { returnPath: "/internal/shopify" };
    requiresLazyLoading = true;
  } else if (pathname === "/internal/configuration-shopify") {
    LayoutComponent = InternalLayout;
    ComponentToRender = ShopifyConfiguration;
    pageProps = { returnPath: "/internal/configuration-shopify" };
    requiresLazyLoading = true;
  } else if (pathname === "/internal/fiche-produits-shopify") {
    LayoutComponent = InternalLayout;
    ComponentToRender = FicheProduitsShopify;
    pageProps = { returnPath: "/internal/fiche-produits-shopify" };
    requiresLazyLoading = true;
  } else if (pathname === "/internal/generation-ec") {
    LayoutComponent = InternalLayout;
    ComponentToRender = GenerationEC;
    pageProps = { returnPath: "/internal/generation-ec" };
    requiresLazyLoading = true;
  } else if (pathname === "/internal/creation-comptes-client") {
    LayoutComponent = InternalLayout;
    ComponentToRender = AdminClientAccounts;
    pageProps = {};
    requiresLazyLoading = true;
  }
  // Admin Routes
  else if (pathname === "/admin" || pathname === "/admin/") {
    LayoutComponent = AdminLayout;
    ComponentToRender = AdminClientAccounts;
    requiresLazyLoading = true;
  } else if (pathname === "/admin/client-accounts") {
    LayoutComponent = AdminLayout;
    ComponentToRender = AdminClientAccounts;
    requiresLazyLoading = true;
  } else if (pathname === "/admin/internal-accounts") {
    LayoutComponent = AdminLayout;
    ComponentToRender = AdminInternalAccounts;
    requiresLazyLoading = true;
  } else if (pathname === "/admin/admin-accounts") {
    LayoutComponent = AdminLayout;
    ComponentToRender = AdminAccounts;
    requiresLazyLoading = true;
  } else if (pathname === "/admin/profile") {
    LayoutComponent = AdminLayout;
    ComponentToRender = AdminProfile;
    requiresLazyLoading = true;
  }

  // Render component with or without lazy loading
  const renderComponent = () => {
    if (requiresLazyLoading) {
      return (
        <LazyComponentWrapper>
          <ComponentToRender {...pageProps} />
        </LazyComponentWrapper>
      );
    }
    return <ComponentToRender {...pageProps} />;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      <main className="flex-1 pt-20">
        <LayoutComponent>{renderComponent()}</LayoutComponent>
      </main>
      <Footer />
    </div>
  );
};

export default App;

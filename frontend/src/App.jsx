import React from "react";
import Header from "./components/Header.jsx";
import Footer from "./components/Footer.jsx"; // Assuming you have a Footer
import MainPage from "./pages/MainPage.jsx";
// ClientLogin, InternalLogin, AdminLogin are now used in MainPage.jsx, not directly here.
// import ClientLogin from "./components/ClientLogin.jsx";
// import InternalLogin from "./components/InternalLogin.jsx";
// import AdminLogin from "./components/admin/AdminLogin.jsx";

// Customer components
import ClientLayout from "./components/customer/ClientLayout.jsx";
import CustomerDashboard from "./components/customer/CustomerDashboard.jsx";
import MesBoutiques from "./components/customer/MesBoutiques.jsx";
import CreateShop from "./components/customer/CreateShop.jsx";
import EditShop from "./components/customer/EditShop.jsx"; // Assuming this component exists
import FeatureUnderConstruction from "./components/customer/FeatureUnderConstruction.jsx"; // Import new component
import ManageAccount from "./components/customer/ManageAccount.jsx"; // Import ManageAccount component
import ClientsAValider from "./components/internal/ClientsAValider.jsx"; // Import ClientsAValider component

// Internal components
import InternalLayout from "./components/internal/InternalLayout.jsx";
import ClientsList from "./components/internal/ClientsList.jsx";
import ClientDetails from "./components/internal/ClientDetails.jsx";
import ClientShops from "./components/internal/ClientShops.jsx";
import ShopDetails from "./components/internal/ShopDetails.jsx";
import AllShops from "./components/internal/AllShops.jsx";
import BoutiquesAValider from "./components/internal/BoutiquesAValider.jsx"; // Import BoutiquesAValider component
import DocumentationSection from "./components/internal/DocumentationSection.jsx"; // Import DocumentationSection component
import ShopifyBoutiques from "./pages/internal/ShopifyBoutiques.jsx"; // Import ShopifyBoutiques component
import ShopifyConfiguration from "./components/internal/shopify/ShopifyConfiguration.jsx";
// import ClientForm from "./components/internal/ClientForm.jsx"; // If used as a standalone page

// Admin components
import AdminLayout from "./components/admin/AdminLayout.jsx";
// Assuming placeholder components for admin sections for now
// You'll need to create these if they don't exist or map to existing ones.
const AdminClientAccounts = () => (
  <div className="p-4">Admin: Gestion des comptes clients</div>
);
const AdminInternalAccounts = () => (
  <div className="p-4">Admin: Gestion des comptes internes</div>
);
const AdminAdminAccounts = () => (
  <div className="p-4">Admin: Gestion des comptes admins</div>
);
const AdminProfile = () => <div className="p-4">Admin: Profil</div>;

const App = () => {
  const { pathname } = window.location;

  let ComponentToRender = MainPage; // Default to MainPage
  let LayoutComponent = ({ children }) => <>{children}</>; // Default no layout
  let pageProps = {}; // To pass props like IDs from path

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
  // Customer Routes
  else if (pathname === "/client/dashboard") {
    LayoutComponent = ClientLayout;
    ComponentToRender = CustomerDashboard;
  } else if (pathname === "/client/boutiques") {
    LayoutComponent = ClientLayout;
    ComponentToRender = MesBoutiques;
    pageProps = {};
  } else if (pathname === "/client/boutiques/create") {
    LayoutComponent = ClientLayout;
    ComponentToRender = CreateShop;
  } else if (pathname.startsWith("/client/boutiques/edit/")) {
    LayoutComponent = ClientLayout;
    ComponentToRender = EditShop;
    const params = extractParams("/client/boutiques/edit/:shopId", pathname);
    pageProps = { shopId: params.shopId, returnPath: "/client/boutiques" };
  } else if (pathname === "/client/compte") {
    LayoutComponent = ClientLayout;
    ComponentToRender = ManageAccount;
    pageProps = { returnPath: "/client/dashboard" };
  }
  // Internal Routes
  else if (pathname === "/internal/clients") {
    LayoutComponent = InternalLayout;
    ComponentToRender = ClientsList;
  } else if (pathname === "/internal/documentation") {
    LayoutComponent = InternalLayout;
    ComponentToRender = DocumentationSection;
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
  } else if (pathname === "/internal/boutiques") {
    LayoutComponent = InternalLayout;
    ComponentToRender = AllShops;
  } else if (pathname === "/internal/boutiques-a-valider") {
    LayoutComponent = InternalLayout;
    ComponentToRender = BoutiquesAValider;
  } else if (pathname === "/internal/clients-a-valider") {
    LayoutComponent = InternalLayout;
    ComponentToRender = ClientsAValider;
  } else if (pathname === "/internal/profile") {
    LayoutComponent = InternalLayout;
    ComponentToRender = FeatureUnderConstruction;
    pageProps = { returnPath: "/internal/clients" };
  } else if (pathname === "/internal/statistiques") {
    LayoutComponent = InternalLayout;
    ComponentToRender = FeatureUnderConstruction;
    pageProps = { returnPath: "/internal/clients" };
  } else if (pathname === "/internal/shopify") {
    LayoutComponent = InternalLayout;
    ComponentToRender = ShopifyBoutiques;
    pageProps = { returnPath: "/internal/shopify" };
  } else if (pathname === "/internal/configuration-shopify") {
    LayoutComponent = InternalLayout;
    ComponentToRender = ShopifyConfiguration;
    pageProps = { returnPath: "/internal/configuration-shopify" };
  } else if (pathname === "/internal/creation-comptes-client") {
    LayoutComponent = InternalLayout;
    ComponentToRender = FeatureUnderConstruction;
    pageProps = { returnPath: "/internal/clients" };
  }
  // Admin Routes
  else if (pathname === "/admin" || pathname === "/admin/") {
    LayoutComponent = AdminLayout;
    ComponentToRender = AdminClientAccounts;
  } else if (pathname === "/admin/client-accounts") {
    LayoutComponent = AdminLayout;
    ComponentToRender = AdminClientAccounts;
  } else if (pathname === "/admin/internal-accounts") {
    LayoutComponent = AdminLayout;
    ComponentToRender = AdminInternalAccounts;
  } else if (pathname === "/admin/admin-accounts") {
    LayoutComponent = AdminLayout;
    ComponentToRender = AdminAdminAccounts;
  } else if (pathname === "/admin/profile") {
    LayoutComponent = AdminLayout;
    ComponentToRender = AdminProfile;
  }
  // Add more routes as needed
  // else {
  //   ComponentToRender = NotFoundPage; // Optional: a 404 component
  // }

  // For components that were expecting props from react-router (like useParams),
  // they will need to be refactored to accept these props directly or get them from window.location.
  // For example, ClientDetails, ClientShops, ShopDetails used useParams.
  // They now get clientId/shopId via pageProps.

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      <main className="flex-1 pt-20">
        <LayoutComponent>
          <ComponentToRender {...pageProps} />
        </LayoutComponent>
      </main>
      <Footer />
    </div>
  );
};

export default App;

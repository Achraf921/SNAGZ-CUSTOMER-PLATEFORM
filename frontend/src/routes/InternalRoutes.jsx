import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import InternalLayout from "../components/internal/InternalLayout";
import ClientsList from "../components/internal/ClientsList";
import ClientDetails from "../components/internal/ClientDetails";
import ClientShops from "../components/internal/ClientShops";
import BoutiquesAValider from "../components/internal/BoutiquesAValider";
import DocumentationSection from "../components/internal/DocumentationSection";
import GenerationDocuments from "../components/internal/GenerationDocuments";
import ShopifyConfiguration from "../components/internal/shopify/ShopifyConfiguration";

const InternalRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<InternalLayout />}>
        <Route index element={<Navigate to="clients" replace />} />
        <Route path="clients" element={<ClientsList />} />
        <Route path="clients/:id" element={<ClientDetails />} />
        <Route path="clients/:id/boutiques" element={<ClientShops />} />
        <Route path="boutiques" element={<BoutiquesAValider />} />
        <Route
          path="configuration-shopify"
          element={<ShopifyConfiguration />}
        />
        <Route path="documentation" element={<DocumentationSection />} />
        <Route path="generation-documents" element={<GenerationDocuments />} />
      </Route>
    </Routes>
  );
};

export default InternalRoutes;

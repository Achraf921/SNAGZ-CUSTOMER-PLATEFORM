import React, { useState } from "react";
import {
  Card,
  Tabs,
  Tab,
  Button,
  Form,
  Container,
  Row,
  Col,
  Alert,
} from "react-bootstrap";
import {
  FaCog,
  FaStore,
  FaPalette,
  FaBoxOpen,
  FaCubes,
  FaCheckCircle,
} from "react-icons/fa";

const ShopifyConfig = () => {
  const [activeTab, setActiveTab] = useState("settings");
  const [shopUrl, setShopUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [password, setPassword] = useState("");
  const [themeName, setThemeName] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsGenerating(true);
    setError("");
    setSuccess("");

    try {
      // TODO: Implement API call to generate Shopify shop
      console.log("Generating Shopify shop with:", {
        shopUrl,
        apiKey,
        themeName,
      });

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 2000));

      setSuccess("Boutique Shopify générée avec succès!");
    } catch (err) {
      setError("Erreur lors de la génération de la boutique: " + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Container fluid className="py-4">
      <h2 className="mb-4">Configuration Shopify</h2>

      {success && <Alert variant="success">{success}</Alert>}
      {error && <Alert variant="danger">{error}</Alert>}

      <Card>
        <Card.Header>
          <Tabs
            activeKey={activeTab}
            onSelect={(k) => setActiveTab(k)}
            className="mb-0"
          >
            <Tab
              eventKey="settings"
              title={
                <span>
                  <FaCog className="me-2" />
                  Paramètres
                </span>
              }
            />
            <Tab
              eventKey="theme"
              title={
                <span>
                  <FaPalette className="me-2" />
                  Thème
                </span>
              }
            />
            <Tab
              eventKey="products"
              title={
                <span>
                  <FaBoxOpen className="me-2" />
                  Produits
                </span>
              }
            />
            <Tab
              eventKey="extensions"
              title={
                <span>
                  <FaCubes className="me-2" />
                  Extensions
                </span>
              }
            />
          </Tabs>
        </Card.Header>

        <Card.Body>
          {activeTab === "settings" && (
            <Form onSubmit={handleSubmit}>
              <Row className="mb-3">
                <Col md={6}>
                  <Form.Group controlId="shopUrl">
                    <Form.Label>URL de la boutique</Form.Label>
                    <Form.Control
                      type="text"
                      placeholder="nom-de-votre-boutique"
                      value={shopUrl}
                      onChange={(e) => setShopUrl(e.target.value)}
                      required
                    />
                    <Form.Text className="text-muted">
                      .myshopify.com sera ajouté automatiquement
                    </Form.Text>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group controlId="themeName">
                    <Form.Label>Nom du thème</Form.Label>
                    <Form.Control
                      type="text"
                      placeholder="Mon Thème Personnalisé"
                      value={themeName}
                      onChange={(e) => setThemeName(e.target.value)}
                      required
                    />
                  </Form.Group>
                </Col>
              </Row>

              <h5 className="mt-4 mb-3">Identifiants API</h5>
              <Row>
                <Col md={6}>
                  <Form.Group controlId="apiKey" className="mb-3">
                    <Form.Label>Clé API</Form.Label>
                    <Form.Control
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      required
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group controlId="password">
                    <Form.Label>Mot de passe API</Form.Label>
                    <Form.Control
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </Form.Group>
                </Col>
              </Row>

              <div className="d-flex justify-content-end mt-4">
                <Button variant="primary" type="submit" disabled={isGenerating}>
                  {isGenerating
                    ? "Génération en cours..."
                    : "Générer la boutique"}
                </Button>
              </div>
            </Form>
          )}

          {activeTab === "theme" && (
            <div>
              <h4>Configuration du thème</h4>
              <p>Personnalisez l'apparence de votre boutique ici.</p>
              {/* Add theme customization components here */}
            </div>
          )}

          {activeTab === "products" && (
            <div>
              <h4>Gestion des produits</h4>
              <p>Gérez les produits de votre boutique Shopify.</p>
              {/* Add product management components here */}
            </div>
          )}

          {activeTab === "extensions" && (
            <div>
              <h4>Extensions Shopify</h4>
              <p>Gérez les extensions de votre boutique.</p>
              {/* Add extensions management components here */}
            </div>
          )}
        </Card.Body>
      </Card>
    </Container>
  );
};

export default ShopifyConfig;

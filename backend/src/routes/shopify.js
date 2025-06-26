const express = require('express');
const router = express.Router();
const { getCustomersCollection } = require('../config/db');
const { startDevStore, continueDevStore, continueCaptcha } = require('../services/createDevStore');
const { getSession, deleteSession } = require('../services/shopifySessionManager');

// Get all shops that can have Shopify integration
router.get('/shops', async (req, res) => {
  try {
    const customersCollection = await getCustomersCollection();
    const customers = await customersCollection.find({}).toArray();
    
    // Filter shops that have estBoutiqueEnLigne set to true
    const shopifyShops = [];
    
    customers.forEach(customer => {
      if (Array.isArray(customer.shops)) {
        customer.shops.forEach(shop => {
          if (shop.estBoutiqueEnLigne) {
            shopifyShops.push({
              shopId: shop.shopId,
              shopName: shop.nomProjet || shop.name || 'Sans nom',
              clientName: customer.raisonSociale || customer.name || 'Client inconnu',
              clientId: customer._id.toString(),
              status: shop.shopifyStatus || 'Non configuré',
              typeAbonnement: shop.typeAbonnementShopify || 'Aucun',
              createdAt: shop.createdAt || new Date()
            });
          }
        });
      }
    });
    
    res.status(200).json({ success: true, shops: shopifyShops });
  } catch (error) {
    console.error('Error fetching Shopify shops:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération des boutiques Shopify' });
  }
});

// Update Shopify configuration for a shop
router.put('/shop/:shopId', async (req, res) => {
  try {
    const { shopId } = req.params;
    const updateData = req.body;
    
    const customersCollection = await getCustomersCollection();
    
    // Find the customer that has this shop
    const customer = await customersCollection.findOne({
      'shops.shopId': shopId
    });
    
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Boutique non trouvée' });
    }
    
    // Update the specific shop
    const result = await customersCollection.updateOne(
      { 'shops.shopId': shopId },
      { $set: { 'shops.$.shopifyConfig': updateData } }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Boutique non trouvée' });
    }
    
    res.status(200).json({ 
      success: true, 
      message: 'Configuration Shopify mise à jour avec succès' 
    });
    
  } catch (error) {
    console.error('Error updating Shopify config:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur lors de la mise à jour de la configuration Shopify' 
    });
  }
});

// -----------------------------------------------------------------------------
// ROUTE : POST /api/shopify/generate/:shopId
// Crée une boutique de développement via Puppeteer puis met à jour Mongo.
// -----------------------------------------------------------------------------

// Generate Shopify store for a given shopId
router.post('/generate/:shopId', async (req, res) => {
  const { shopId } = req.params;
  try {
    const customersCollection = await getCustomersCollection();
    const customer = await customersCollection.findOne({
      'shops.shopId': shopId,
    });

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Boutique non trouvée' });
    }

    const shop = (customer.shops || []).find((s) => s.shopId === shopId);
    if (!shop) {
      return res.status(404).json({ success: false, message: 'Boutique non trouvée' });
    }

    // Basic validation: must be validated & documented
    if (shop.status !== 'valid' || (shop.documented !== true && shop.documented !== 'documented')) {
      return res.status(400).json({ success: false, message: 'La boutique doit être validée et documentée' });
    }

    // Already has shopify?
    if (shop.hasShopify === true) {
      return res.status(400).json({ success: false, message: 'Cette boutique possède déjà un store Shopify' });
    }

    const rawName = shop.projectName || shop.nomProjet || shop.name || `shop-${shopId}`;
    const storeName = `${rawName}-${Date.now()}`.replace(/\s+/g, '-').toLowerCase();
    const meta = { shopId, customerId: customer._id, nomProjet: rawName };

    const result = await startDevStore(storeName, meta);

    if (result.requiresCaptcha) {
      console.log('[Shopify] CAPTCHA required → HTTP 203, session', result.sessionId);
      return res.status(203).json({ 
        requiresCaptcha: true, 
        sessionId: result.sessionId,
        captchaUrl: result.captchaUrl,
        message: result.message
      });
    }

    if (result.requires2FA) {
      console.log('[Shopify] 2FA required → HTTP 202, session', result.sessionId);
      // save mapping of session to db ids is already in meta
      return res.status(202).json({ requires2FA: true, sessionId: result.sessionId });
    }

    // otherwise update DB and return success
    await customersCollection.updateOne(
      { 'shops.shopId': shopId },
      {
        $set: {
          'shops.$.hasShopify': true,
          'shops.$.shopifyDomain': result.domain,
          'shops.$.shopifyAdminUrl': result.adminUrl,
          'shops.$.shopifyCreatedAt': new Date(),
        },
      }
    );

    return res.json({ success: true, domain: result.domain });
  } catch (err) {
    console.error('Error generating store', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/shopify/captcha/:sessionId - Continue after CAPTCHA is solved
router.post('/captcha/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  console.log('[Shopify] /captcha continue requested for session', sessionId);

  try {
    if (!getSession(sessionId)) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }

    const result = await continueCaptcha(sessionId);

    if (result.requires2FA) {
      console.log('[Shopify] CAPTCHA solved but 2FA required → HTTP 202, session', sessionId);
      return res.status(202).json({ requires2FA: true, sessionId });
    }

    if (result && result.meta) {
      const { shopId, customerId } = result.meta;
      const customersCollection = await getCustomersCollection();
      await customersCollection.updateOne(
        { _id: customerId, 'shops.shopId': shopId },
        {
          $set: {
            'shops.$.hasShopify': true,
            'shops.$.shopifyDomain': result.domain,
            'shops.$.shopifyAdminUrl': result.adminUrl,
            'shops.$.shopifyCreatedAt': new Date(),
          },
        }
      );
    }

    return res.json({ success: true, domain: result.domain });
  } catch (err) {
    console.error('CAPTCHA continuation failed', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/shopify/2fa/:sessionId  { code }
router.post('/2fa/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const { code } = req.body;
  console.log('[Shopify] /2fa code reçu:', code);
  const cleanCode = String(code || '').trim();
  if (!/^[0-9]{6}$/.test(cleanCode)) {
    return res.status(400).json({ error: 'Invalid code' });
  }

  try {
    if (!getSession(sessionId)) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }

    console.log('[Shopify] Reçu code 2FA pour session', sessionId);
    const result = await continueDevStore(sessionId, code);

    // Handle incorrect OTP case - keep session alive
    if (result && result.error === 'OTP_INCORRECT') {
      console.log('[Shopify] Code 2FA incorrect, session kept alive for retry');
      return res.status(400).json({ 
        error: 'OTP_INCORRECT', 
        message: result.message,
        sessionStillActive: true 
      });
    }

    if (result && result.meta) {
      const { shopId, customerId } = result.meta;
      const customersCollection = await getCustomersCollection();
      await customersCollection.updateOne(
        { _id: customerId, 'shops.shopId': shopId },
        {
          $set: {
            'shops.$.hasShopify': true,
            'shops.$.shopifyDomain': result.domain,
            'shops.$.shopifyAdminUrl': result.adminUrl,
            'shops.$.shopifyCreatedAt': new Date(),
          },
        }
      );
    }

    return res.json({ success: true, domain: result.domain });
  } catch (err) {
    console.error('2FA completion failed', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/shopify/cancel/:sessionId - Cancel the process and close browser
router.post('/cancel/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  console.log('[Shopify] /cancel requested for session', sessionId);

  try {
    const sess = getSession(sessionId);
    if (!sess) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }

    console.log('[Shopify] Annulation du processus pour session', sessionId);
    
    // Close the browser if it exists and is connected
    if (sess.page && sess.page.browser && sess.page.browser().isConnected()) {
      console.log('[Shopify] Fermeture du navigateur...');
      await sess.page.browser().close();
    }
    
    // Delete the session
    deleteSession(sessionId);
    
    // Clean up global validation data
    global.currentShopValidation = null;

    return res.json({ success: true, message: 'Processus annulé et navigateur fermé' });
  } catch (err) {
    console.error('Cancel process failed', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;

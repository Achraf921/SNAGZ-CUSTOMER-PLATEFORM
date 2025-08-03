const express = require('express');
const router = express.Router();
const { getCustomersCollection } = require('../config/db');
// createDevStore service temporarily disabled - will be reimplemented later
// const { startDevStore, continueDevStore, continueCaptcha } = require('../services/createDevStore');
const { getSession, deleteSession, getAllSessions } = require('../services/shopifySessionManager');
const { ObjectId } = require('mongodb');
require('isomorphic-fetch');

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

    // TODO: Reimplement createDevStore service
    const result = { 
      error: 'Shopify store generation temporarily disabled',
      message: 'This feature is being reimplemented. Please try again later.'
    };

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

    // TODO: Reimplement createDevStore service
    const result = { 
      error: 'Shopify store generation temporarily disabled',
      message: 'This feature is being reimplemented. Please try again later.'
    };

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
    // TODO: Reimplement createDevStore service
    const result = { 
      error: 'Shopify store generation temporarily disabled',
      message: 'This feature is being reimplemented. Please try again later.'
    };

    // Handle CAPTCHA requirement after 2FA
    if (result && result.requiresCaptcha) {
      console.log('[Shopify] CAPTCHA required after 2FA → HTTP 203, session', result.sessionId);
      return res.status(203).json({ 
        requiresCaptcha: true, 
        sessionId: result.sessionId,
        captchaUrl: result.captchaUrl,
        message: result.message
      });
    }

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

// GET /api/shopify/status/:shopId - Check if generation is running for a shop
router.get('/status/:shopId', async (req, res) => {
  const { shopId } = req.params;
  
  try {
    // Check if any active session exists for this shopId
    const activeSessions = [];
    const sessions = getAllSessions();
    for (const [sessionId, sessionData] of sessions.entries()) {
      if (sessionData.meta && sessionData.meta.shopId === shopId) {
        // Check if browser is still connected
        const isConnected = sessionData.page && 
                           sessionData.page.browser && 
                           sessionData.page.browser().isConnected();
        if (isConnected) {
          activeSessions.push(sessionId);
        } else {
          // Clean up dead session
          deleteSession(sessionId);
        }
      }
    }
    
    return res.json({ 
      running: activeSessions.length > 0,
      activeSessions: activeSessions.length
    });
  } catch (err) {
    console.error('Status check failed', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/shopify/force-refresh/:sessionId - Force refresh when CAPTCHA is stuck
router.post('/force-refresh/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  
  try {
    const sess = getSession(sessionId);
    if (!sess || !sess.page) {
      return res.status(404).json({ error: 'Session not found or no active page' });
    }

    console.log('[Shopify] Force refreshing page for stuck hCaptcha, session:', sessionId);
    
    // Get current URL before refresh
    const currentUrl = sess.page.url();
    console.log('[Shopify] Current URL before refresh:', currentUrl);
    
    // Try multiple refresh strategies
    try {
      // Strategy 1: Simple reload
      await sess.page.reload({ waitUntil: 'networkidle0', timeout: 10000 });
      console.log('[Shopify] Page reloaded successfully');
    } catch (reloadErr) {
      console.log('[Shopify] Reload failed, trying navigation refresh:', reloadErr.message);
      
      // Strategy 2: Navigate to current URL
      try {
        await sess.page.goto(currentUrl, { waitUntil: 'networkidle0', timeout: 10000 });
        console.log('[Shopify] Navigation refresh successful');
      } catch (navErr) {
        console.log('[Shopify] Navigation refresh failed, trying force reload:', navErr.message);
        
        // Strategy 3: Force reload with cache bypass
        await sess.page.evaluate(() => window.location.reload(true));
        await sess.page.waitForLoadState('networkidle', { timeout: 10000 });
        console.log('[Shopify] Force reload completed');
      }
    }
    
    // Wait a moment for page to stabilize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check if hCaptcha is now working
    const captchaStatus = await sess.page.evaluate(() => {
      const hcaptchaElements = document.querySelectorAll('.h-captcha, [data-sitekey]');
      const hcaptchaWorking = hcaptchaElements.length > 0;
      const hasLoadingElements = document.querySelectorAll('[class*="loading"], [class*="spinner"]').length > 0;
      
      return {
        hcaptchaElements: hcaptchaElements.length,
        hcaptchaWorking,
        hasLoadingElements,
        pageTitle: document.title,
        currentUrl: window.location.href
      };
    });
    
    console.log('[Shopify] Post-refresh CAPTCHA status:', captchaStatus);
    
    return res.json({ 
      success: true, 
      message: 'Page refreshed successfully',
      captchaStatus,
      newUrl: sess.page.url()
    });
    
  } catch (err) {
    console.error('Force refresh failed:', err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/shopify/live/:sessionId - Get live browser content for CAPTCHA solving
router.get('/live/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const { popup, preview } = req.query;
  
  try {
    const sess = getSession(sessionId);
    if (!sess || !sess.page) {
      return res.status(404).json({ error: 'Session not found or no active page' });
    }

    // Get the current page HTML content
    const pageContent = await sess.page.content();
    const currentUrl = sess.page.url();
    
    // Get all cookies to maintain session state
    const cookies = await sess.page.cookies();
    
    // Different styling based on mode
    const isPopup = popup === 'true';
    const isPreview = preview === 'true';
    
    const stylesForMode = isPopup ? `
      /* Popup mode - full functionality */
      body { 
        margin: 0; 
        padding: 20px;
        background: #fff;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      /* Add popup-specific styling */
      .popup-header {
        background: #3b82f6;
        color: white;
        padding: 10px 20px;
        margin: -20px -20px 20px -20px;
        font-weight: bold;
        border-radius: 0;
      }
    ` : isPreview ? `
      /* Preview mode - limited interaction */
      body { 
        margin: 0; 
        padding: 10px;
        background: #f9f9f9;
        pointer-events: none;
        opacity: 0.7;
        transform: scale(0.8);
        transform-origin: top left;
      }
    ` : `
      /* Iframe mode - minimal styling */
      body { 
        margin: 0; 
        padding: 10px;
        background: #fff;
      }
    `;

    const modifiedContent = pageContent.replace(
      '<head>',
      `<head>
        <base href="${currentUrl}">
        <meta name="referrer" content="same-origin">
        <style>
          ${stylesForMode}
          /* Don't hide elements that might be part of CAPTCHA */
          iframe[src*="recaptcha"], 
          iframe[src*="captcha"],
          iframe[src*="hcaptcha"],
          div[id*="captcha"],
          div[class*="captcha"],
          div[class*="hcaptcha"],
          .g-recaptcha,
          .h-captcha,
          [data-sitekey],
          [data-captcha] {
            display: block !important;
            opacity: 1 !important;
            visibility: visible !important;
            pointer-events: ${isPreview ? 'none' : 'auto'} !important;
          }
          /* Hide common loading animations that might appear */
          [class*="spinner"], 
          [class*="loading"], 
          [class*="loader"],
          [id*="spinner"], 
          [id*="loading"], 
          [id*="loader"],
          .loading-overlay,
          .spinner-overlay,
          .loading-indicator {
            display: none !important;
          }
          /* Hide loading animations by common selectors */
          div[role="progressbar"],
          div[aria-label*="loading"],
          div[aria-label*="Loading"] {
            display: none !important;
          }
          /* Ensure CAPTCHA containers are fully visible */
          form, [role="form"] {
            position: relative !important;
            z-index: 10 !important;
          }
        </style>
        <script>
          const isPopup = ${isPopup};
          const isPreview = ${isPreview};
          
          // Minimal JavaScript to avoid breaking CAPTCHA
          document.addEventListener('DOMContentLoaded', function() {
            ${isPopup ? `
            // Add popup header
            const header = document.createElement('div');
            header.className = 'popup-header';
            header.innerHTML = '🤖 Résolution CAPTCHA - Fenêtre dédiée';
            document.body.insertBefore(header, document.body.firstChild);
            
            // Add close button functionality
            const closeBtn = document.createElement('button');
            closeBtn.innerHTML = '✕ Fermer après résolution';
            closeBtn.style.cssText = 'position: fixed; top: 10px; right: 10px; z-index: 10000; background: #ef4444; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer;';
            closeBtn.onclick = function() {
              alert('Assurez-vous que le CAPTCHA est résolu avant de fermer cette fenêtre!');
              window.close();
            };
            document.body.appendChild(closeBtn);
            ` : ''}
            
            ${!isPreview ? `
            // Remove loading animations that might appear
            function hideLoadingElements() {
              const loadingSelectors = [
                '[class*="spinner"]', '[class*="loading"]', '[class*="loader"]',
                '[id*="spinner"]', '[id*="loading"]', '[id*="loader"]',
                '.loading-overlay', '.spinner-overlay', '.loading-indicator',
                'div[role="progressbar"]', 'div[aria-label*="loading"]', 'div[aria-label*="Loading"]'
              ];
              
              loadingSelectors.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                elements.forEach(el => {
                  // Only hide if it's not part of CAPTCHA
                  if (!el.closest('[id*="captcha"]') && 
                      !el.closest('[class*="captcha"]') && 
                      !el.closest('.g-recaptcha')) {
                    el.style.display = 'none';
                  }
                });
              });
            }
            
            // Hide loading elements initially and periodically
            hideLoadingElements();
            setInterval(hideLoadingElements, 1000);
            
            // Enable all disabled elements that might be CAPTCHA related
            const disabledElements = document.querySelectorAll('[disabled]');
            disabledElements.forEach(el => {
              if (el.getAttribute('data-captcha') || 
                  el.getAttribute('data-sitekey') ||
                  el.className.includes('captcha') || 
                  el.className.includes('hcaptcha') ||
                  el.id.includes('captcha') ||
                  el.id.includes('hcaptcha')) {
                el.removeAttribute('disabled');
              }
            });
            
            // Force enable hCaptcha specifically
            setTimeout(() => {
              const hcaptchaElements = document.querySelectorAll('.h-captcha, [data-sitekey]');
              hcaptchaElements.forEach(el => {
                el.style.display = 'block';
                el.style.visibility = 'visible';
                el.style.opacity = '1';
                el.removeAttribute('disabled');
              });
              
              // Force hCaptcha to reinitialize if it's stuck loading
              if (window.hcaptcha && typeof window.hcaptcha.render === 'function') {
                hcaptchaElements.forEach(el => {
                  if (el.hasAttribute('data-sitekey')) {
                    try {
                      window.hcaptcha.render(el);
                    } catch (e) {
                      console.log('hCaptcha render attempt:', e);
                    }
                  }
                });
              }
              
              // Remove iframe restrictions that might block hCaptcha
              const iframes = document.querySelectorAll('iframe[src*="hcaptcha"]');
              iframes.forEach(iframe => {
                iframe.removeAttribute('sandbox');
                iframe.style.display = 'block';
                iframe.style.visibility = 'visible';
              });
            }, 500);
            
            // Additional hCaptcha loading attempts
            const maxRetries = 10;
            let retryCount = 0;
            const forceHcaptchaLoad = setInterval(() => {
              retryCount++;
              if (retryCount > maxRetries) {
                clearInterval(forceHcaptchaLoad);
                return;
              }
              
              // Check if hCaptcha is loaded but stuck
              const hcaptchaContainers = document.querySelectorAll('.h-captcha, [data-sitekey]');
              hcaptchaContainers.forEach(container => {
                // Force visibility
                container.style.cssText += 'display: block !important; visibility: visible !important; opacity: 1 !important;';
                
                // Remove any loading overlays on the container
                const loadingOverlays = container.querySelectorAll('[class*="loading"], [class*="spinner"]');
                loadingOverlays.forEach(overlay => overlay.remove());
              });
              
              // Check if hCaptcha script is loaded but not initialized
              if (window.hcaptcha && document.querySelector('.h-captcha:empty')) {
                window.hcaptcha.render('.h-captcha');
              }
            }, 2000);
            
            // Listen for CAPTCHA completion
            const observer = new MutationObserver(function(mutations) {
              mutations.forEach(function(mutation) {
                if (mutation.type === 'childList' || mutation.type === 'attributes') {
                  // Check if CAPTCHA might be completed (reCAPTCHA)
                  const recaptchaResponse = document.querySelector('[name="g-recaptcha-response"]');
                  // Check if hCaptcha might be completed
                  const hcaptchaResponse = document.querySelector('[name="h-captcha-response"]');
                  
                  if ((recaptchaResponse && recaptchaResponse.value) || 
                      (hcaptchaResponse && hcaptchaResponse.value)) {
                    ${isPopup ? `
                    // Show success message in popup
                    const successMsg = document.createElement('div');
                    successMsg.style.cssText = 'position: fixed; top: 50px; left: 50%; transform: translateX(-50%); background: #10b981; color: white; padding: 15px 25px; border-radius: 8px; z-index: 10001; font-weight: bold;';
                    successMsg.innerHTML = '✅ CAPTCHA résolu! Vous pouvez fermer cette fenêtre.';
                    document.body.appendChild(successMsg);
                    
                    // Auto-close after 3 seconds
                    setTimeout(() => {
                      window.close();
                    }, 3000);
                    ` : `
                    window.parent.postMessage({ type: 'captcha_completed' }, '*');
                    `}
                  }
                }
              });
            });
            
            observer.observe(document.body, {
              childList: true,
              subtree: true,
              attributes: true,
              attributeFilter: ['value', 'class', 'style']
            });
            ` : ''}
          });
        </script>`
    );

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    // res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
    
    // Add permissions and features for hCaptcha
    if (isPopup) {
      // For popup mode, allow more permissions
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
      res.setHeader('Referrer-Policy', 'same-origin');
    } else {
      // For iframe mode, be more restrictive but allow hCaptcha
      // res.setHeader('Content-Security-Policy', "frame-ancestors 'self'; script-src 'self' 'unsafe-inline' https://hcaptcha.com https://*.hcaptcha.com; frame-src 'self' https://hcaptcha.com https://*.hcaptcha.com; connect-src 'self' https://hcaptcha.com https://*.hcaptcha.com");
    }
    
    // Set cookies from the original session
    cookies.forEach(cookie => {
      res.setHeader('Set-Cookie', `${cookie.name}=${cookie.value}; Path=${cookie.path || '/'}; ${cookie.secure ? 'Secure;' : ''} ${cookie.httpOnly ? 'HttpOnly;' : ''}`);
    });
    
    res.send(modifiedContent);
  } catch (err) {
    console.error('Live content failed', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/shopify/debug/:sessionId - Debug page structure for CAPTCHA troubleshooting
router.get('/debug/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  
  try {
    const sess = getSession(sessionId);
    if (!sess || !sess.page) {
      return res.status(404).json({ error: 'Session not found or no active page' });
    }

    console.log('[Shopify] Debugging page structure, session:', sessionId);
    
    // Analyze the page structure
    const pageAnalysis = await sess.page.evaluate(() => {
      const analysis = {
        url: window.location.href,
        title: document.title,
        captchaElements: [],
        allIframes: [],
        allElements: [],
        pageText: document.body.innerText.substring(0, 500)
      };
      
      // Find all potential CAPTCHA elements
      const captchaSelectors = [
        '.h-captcha',
        '.g-recaptcha',
        '[data-sitekey]',
        '[data-captcha]',
        '[role="checkbox"]',
        'iframe[src*="hcaptcha"]',
        'iframe[src*="recaptcha"]',
        'iframe[src*="captcha"]'
      ];
      
      captchaSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          const rect = el.getBoundingClientRect();
          analysis.captchaElements.push({
            selector,
            tagName: el.tagName,
            id: el.id,
            className: el.className,
            visible: el.offsetParent !== null,
            rect: {
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height
            },
            attributes: Array.from(el.attributes).map(attr => ({
              name: attr.name,
              value: attr.value
            })),
            innerHTML: el.innerHTML.substring(0, 200)
          });
        });
      });
      
      // Find all iframes
      const iframes = document.querySelectorAll('iframe');
      iframes.forEach(iframe => {
        const rect = iframe.getBoundingClientRect();
        analysis.allIframes.push({
          src: iframe.src,
          id: iframe.id,
          className: iframe.className,
          visible: iframe.offsetParent !== null,
          rect: {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height
          }
        });
      });
      
      // Find clickable elements
      const clickableElements = document.querySelectorAll('button, [role="button"], [onclick], a, input[type="checkbox"], input[type="button"]');
      clickableElements.forEach(el => {
        if (el.offsetParent !== null) {
          const rect = el.getBoundingClientRect();
          analysis.allElements.push({
            tagName: el.tagName,
            type: el.type,
            role: el.getAttribute('role'),
            text: (el.innerText || el.textContent || '').substring(0, 100),
            className: el.className,
            rect: {
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height
            }
          });
        }
      });
      
      return analysis;
    });
    
    // Take a screenshot for visual debugging
    const screenshot = await sess.page.screenshot({ 
      fullPage: false,
      encoding: 'base64'
    });
    
    // Get frame information
    const frames = await sess.page.frames();
    const frameInfo = frames.map(frame => ({
      url: frame.url(),
      name: frame.name(),
      isDetached: frame.isDetached()
    }));
    
    return res.json({
      success: true,
      pageAnalysis,
      frameInfo,
      screenshot: `data:image/png;base64,${screenshot}`,
      message: 'Page analysis complete'
    });
    
  } catch (err) {
    console.error('Debug analysis failed:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/shopify/click-captcha/:sessionId - Click CAPTCHA checkbox and stream modal
router.post('/click-captcha/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  
  try {
    const sess = getSession(sessionId);
    if (!sess || !sess.page) {
      return res.status(404).json({ error: 'Session not found or no active page' });
    }

    console.log('[Shopify] Clicking CAPTCHA checkbox, session:', sessionId);
    
    // Try multiple strategies to click the CAPTCHA
    let captchaClicked = { success: false };
    
    // Strategy 1: Visual detection and coordinate clicking
    try {
      // Take a screenshot to analyze the page
      const screenshot = await sess.page.screenshot({ fullPage: false });
      
      // Look for CAPTCHA elements and get their bounding boxes
      const captchaElements = await sess.page.evaluate(() => {
        const elements = [];
        
        // Look for hCaptcha and reCAPTCHA containers
        const selectors = [
          '.h-captcha',
          '.g-recaptcha',
          '[data-sitekey]',
          '[data-captcha]',
          'iframe[src*="hcaptcha"]',
          'iframe[src*="recaptcha"]'
        ];
        
        selectors.forEach(selector => {
          const element = document.querySelector(selector);
          if (element && element.offsetParent !== null) {
            const rect = element.getBoundingClientRect();
            elements.push({
              selector,
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
              width: rect.width,
              height: rect.height,
              visible: rect.width > 0 && rect.height > 0
            });
          }
        });
        
        return elements;
      });
      
      console.log('[Shopify] Found CAPTCHA elements for clicking:', captchaElements);
      
      // Try clicking each element by coordinates
      for (const element of captchaElements) {
        if (element.visible && element.width > 0 && element.height > 0) {
          try {
            console.log(`[Shopify] Attempting coordinate click at (${element.x}, ${element.y}) for ${element.selector}`);
            
            // Click at the center of the element
            await sess.page.mouse.click(element.x, element.y);
            
            // Wait a moment to see if something happened
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Check if a modal or challenge appeared
            const quickCheck = await sess.page.evaluate(() => {
              const modals = document.querySelectorAll('[role="dialog"], .modal, .challenge, [class*="modal"], [class*="challenge"]');
              return modals.length > 0;
            });
            
            if (quickCheck) {
              captchaClicked = { 
                success: true, 
                method: 'coordinate-click', 
                element: element.selector,
                coordinates: { x: element.x, y: element.y }
              };
              console.log('[Shopify] Coordinate click successful!');
              break;
            }
          } catch (clickErr) {
            console.log('[Shopify] Coordinate click failed:', clickErr.message);
          }
        }
      }
    } catch (err) {
      console.log('[Shopify] Visual detection strategy failed:', err.message);
    }
    
    // Strategy 2: Force focus and trigger events
    if (!captchaClicked.success) {
      try {
        captchaClicked = await sess.page.evaluate(() => {
          const captchaContainers = [
            '.h-captcha',
            '.g-recaptcha', 
            '[data-sitekey]',
            '[data-captcha]'
          ];
          
          for (const selector of captchaContainers) {
            const container = document.querySelector(selector);
            if (container && container.offsetParent !== null) {
              console.log('Force triggering events on CAPTCHA container:', selector);
              
              // Try multiple event types
              const events = ['click', 'mousedown', 'mouseup', 'focus', 'touchstart'];
              events.forEach(eventType => {
                const event = new Event(eventType, { bubbles: true, cancelable: true });
                container.dispatchEvent(event);
              });
              
              // Also try mouse events
              const mouseEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true,
                clientX: container.getBoundingClientRect().left + container.getBoundingClientRect().width / 2,
                clientY: container.getBoundingClientRect().top + container.getBoundingClientRect().height / 2
              });
              container.dispatchEvent(mouseEvent);
              
              return { success: true, method: 'event-trigger', selector };
            }
          }
          return { success: false };
        });
        
        if (captchaClicked.success) {
          console.log('[Shopify] Event trigger successful:', captchaClicked);
        }
      } catch (err) {
        console.log('[Shopify] Event trigger strategy failed:', err.message);
      }
    }

    // Strategy 3: Try iframe-based approaches with frame navigation
    if (!captchaClicked.success) {
      try {
        const frames = await sess.page.frames();
        console.log('[Shopify] Found', frames.length, 'frames');
        
        for (const frame of frames) {
          try {
            const frameUrl = frame.url();
            if (frameUrl.includes('hcaptcha') || frameUrl.includes('recaptcha') || frameUrl.includes('captcha')) {
              console.log('[Shopify] Found CAPTCHA frame:', frameUrl);
              
              // Try to find checkbox in this frame
              const checkbox = await frame.$('[role="checkbox"], input[type="checkbox"], .checkbox');
              if (checkbox) {
                await checkbox.click();
                captchaClicked = { success: true, method: 'frame-checkbox-click', frameUrl };
                console.log('[Shopify] Frame checkbox click successful!');
                break;
              }
              
              // Try clicking anywhere in the frame
              await frame.click('body');
              captchaClicked = { success: true, method: 'frame-body-click', frameUrl };
              console.log('[Shopify] Frame body click attempted');
              break;
            }
          } catch (frameErr) {
            console.log('[Shopify] Frame interaction failed:', frameErr.message);
          }
        }
      } catch (err) {
        console.log('[Shopify] Frame strategy failed:', err.message);
      }
    }

    // Strategy 4: Keyboard interaction (Tab + Space)
    if (!captchaClicked.success) {
      try {
        console.log('[Shopify] Trying keyboard interaction strategy');
        
        // Focus on the page and try to tab to the CAPTCHA
        await sess.page.focus('body');
        
        // Try tabbing through elements to find the CAPTCHA
        for (let i = 0; i < 10; i++) {
          await sess.page.keyboard.press('Tab');
          await new Promise(resolve => setTimeout(resolve, 200));
          
          // Check if we're focused on a CAPTCHA element
          const focusedElement = await sess.page.evaluate(() => {
            const focused = document.activeElement;
            if (focused) {
              const isInCaptcha = focused.closest('.h-captcha') || 
                                 focused.closest('.g-recaptcha') || 
                                 focused.closest('[data-sitekey]') ||
                                 focused.getAttribute('role') === 'checkbox';
              return isInCaptcha ? {
                tagName: focused.tagName,
                role: focused.getAttribute('role'),
                ariaLabel: focused.getAttribute('aria-label'),
                inCaptcha: true
              } : null;
            }
            return null;
          });
          
          if (focusedElement) {
            console.log('[Shopify] Found focused CAPTCHA element:', focusedElement);
            await sess.page.keyboard.press('Space');
            captchaClicked = { success: true, method: 'keyboard-space', element: focusedElement };
            break;
          }
        }
      } catch (err) {
        console.log('[Shopify] Keyboard strategy failed:', err.message);
      }
    }

    if (!captchaClicked.success) {
      return res.status(404).json({ 
        error: 'CAPTCHA checkbox not found or could not be clicked',
        details: 'Tried coordinate clicking, event triggering, frame navigation, and keyboard interaction'
      });
    }

    console.log('[Shopify] CAPTCHA clicked successfully:', captchaClicked);

    // Wait longer for the modal/challenge to appear
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check if a modal or challenge appeared
    const modalStatus = await sess.page.evaluate(() => {
      // Look for modal indicators
      const modalSelectors = [
        '[role="dialog"]',
        '.modal',
        '.popup',
        '.challenge',
        '.captcha-modal',
        '.captcha-challenge',
        '[class*="modal"]',
        '[class*="popup"]',
        '[class*="dialog"]',
        '[class*="challenge"]',
        'iframe[src*="challenge"]',
        'iframe[src*="modal"]'
      ];
      
      const modals = [];
      for (const selector of modalSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          elements.forEach(el => {
            if (el.offsetParent !== null) { // Element is visible
              modals.push({
                selector,
                visible: true,
                text: el.innerText?.substring(0, 100) || '',
                tagName: el.tagName,
                className: el.className
              });
            }
          });
        }
      }
      
      // Also check for new iframes that might have appeared
      const newIframes = Array.from(document.querySelectorAll('iframe')).map(iframe => ({
        src: iframe.src,
        visible: iframe.offsetParent !== null,
        className: iframe.className
      }));
      
      return {
        modalsFound: modals.length,
        modals,
        iframes: newIframes,
        pageTitle: document.title,
        url: window.location.href,
        bodyText: document.body.innerText.substring(0, 200)
      };
    });

    return res.json({ 
      success: true,
      clickResult: captchaClicked,
      modalStatus,
      message: 'CAPTCHA clicked - modal should be available for streaming'
    });
    
  } catch (err) {
    console.error('CAPTCHA click failed:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Manual parametrization endpoint (updated for GraphQL)
router.post('/parametrize/:shopId', async (req, res) => {
    try {
        const { shopId } = req.params;
        const { accessToken } = req.body; // Access token provided by user

        console.log(`🔧 Manual parametrization requested for shop ID: ${shopId}`);

        const customersCollection = await getCustomersCollection();
        
        // Find the customer and shop
        const customer = await customersCollection.findOne({
            'shops.shopId': shopId
        });

        if (!customer) {
            return res.status(404).json({ error: 'Shop non trouvé' });
        }

        const shop = customer.shops.find(s => s.shopId === shopId);
        if (!shop) {
            return res.status(404).json({ error: 'Shop non trouvé' });
        }

        if (!shop.hasShopify || !shop.shopifyDomain) {
            return res.status(400).json({ error: 'Aucun domaine Shopify associé à ce shop' });
        }

        // Use provided access token or require it
        if (!accessToken) {
            return res.status(400).json({ 
                error: 'Access token requis',
                message: 'Veuillez fournir un access token Shopify dans le body de la requête',
                instructions: {
                    step1: "Créez une app privée dans votre Shopify Admin",
                    step2: "Allez dans Settings > Apps and sales channels > Develop apps",
                    step3: "Créez une nouvelle app avec les scopes: read_shop_information, write_shop_information",
                    step4: "Copiez l'access token et l'envoyez dans cette requête"
                }
            });
        }

        console.log(`🔧 Starting GraphQL parametrization for ${shop.shopifyDomain}...`);
        console.log(`🔧 Access token received: ${accessToken?.substring(0, 20)}...`);
        console.log(`🔧 Project name: ${shop.nomProjet || shop.name || 'SHOP'}`);

        // Use the new GraphQL-based parametrization
        const { parametrizeShopViaGraphQL } = require('../services/shopifyParametrization');
        const result = await parametrizeShopViaGraphQL(
            shop.shopifyDomain, 
            accessToken, 
            shop.nomProjet || shop.name || 'SHOP'
        );

        // Update shop status in the customer document
        const updateData = {
            'shops.$.shopifyParametrizationAttemptedAt': new Date()
        };

        if (result.success && result.parametrized) {
            updateData['shops.$.shopifyParametrized'] = true;
            updateData['shops.$.shopifyParametrizedAt'] = new Date();
            updateData['shops.$.shopifyParametrizationError'] = null;
        } else {
            updateData['shops.$.shopifyParametrized'] = false;
            updateData['shops.$.shopifyParametrizationError'] = result.error || 'Parametrization failed';
        }

        await customersCollection.updateOne(
            { _id: customer._id, 'shops.shopId': shopId },
            { $set: updateData }
        );

        // Handle all cases with defensive programming
        try {
            if (result.requiresManualSetup || (!result.success && !result.parametrized)) {
                console.log('🔧 Preparing manual setup response...');
                
                // Create fallback manual steps with hardcoded values
                const defaultBillingFields = {
                    "Raison sociale": "sna gz",
                    "Pays/région": "France", 
                    "Adresse": "Za de saint anne",
                    "Code postal": "61190",
                    "Ville": "Tourouvre au perche"
                };
                
                const defaultOrderPrefix = `#${(shop.nomProjet || shop.name || 'SHOP').toUpperCase()}`;
                const shopUrl = `https://${shop.shopifyDomain.includes('.myshopify.com') ? shop.shopifyDomain : shop.shopifyDomain + '.myshopify.com'}/admin`;
                
                console.log('🔧 Manual setup data prepared successfully');
                
                return res.json({
                    success: true,
                    message: 'Paramétrage analysé - Configuration manuelle requise',
                    result: {
                        requiresManualSetup: true,
                        shopUrl: shopUrl,
                        manualSteps: [
                            {
                                title: "Information de facturation",
                                path: "Settings > General > Store details",
                                fields: defaultBillingFields
                            },
                            {
                                title: "Référence de commande", 
                                path: "Settings > Checkout > Order ID format",
                                field: "Prefix",
                                value: defaultOrderPrefix
                            }
                        ]
                    }
                });
            }
        } catch (responseError) {
            console.error('🔧 Error preparing manual setup response:', responseError);
            return res.json({
                success: true,
                message: 'Configuration manuelle requise',
                result: {
                    requiresManualSetup: true,
                    shopUrl: `https://${shop.shopifyDomain}.myshopify.com/admin`,
                    note: "Veuillez configurer manuellement les paramètres de facturation et le préfixe de commande"
                }
            });
        }
        
        if (result.success) {
            return res.json({
                success: true,
                message: result.method === 'Already Configured' 
                    ? 'Shop déjà paramétré correctement' 
                    : 'Paramétrage réussi via API',
                result: result
            });
        } else {
            return res.status(500).json({
                success: false,
                message: 'Erreur lors du paramétrage',
                error: result.error
            });
        }

    } catch (error) {
        console.error('🔧 MAIN CATCH - Erreur lors du paramétrage manuel:');
        console.error('🔧 Error message:', error.message);
        console.error('🔧 Error stack:', error.stack);
        console.error('🔧 Full error object:', error);
        res.status(500).json({ 
            error: 'Erreur interne du serveur', 
            details: error.message,
            stack: error.stack
        });
    }
});

// GET /api/shopify/parametrization-page/:shopId - Serve Shopify admin page for parametrization wizard
router.get('/parametrization-page/:shopId', async (req, res) => {
  const { shopId } = req.params;
  try {
    // Find the shop in the database for context info
    const customersCollection = await getCustomersCollection();
    const customer = await customersCollection.findOne({
      'shops.shopId': shopId
    });

    let shopName = 'Votre boutique';
    if (customer) {
      const shop = customer.shops.find(s => s.shopId === shopId);
      if (shop) {
        shopName = shop.name || shop.nomProjet || 'Votre boutique';
      }
    }

    // Allow custom target passed via ?u= (encoded URI component)
    const rawUrl = req.query.u ? decodeURIComponent(req.query.u) : null;
    const allowedPattern = /^(https?:\/\/(?:[\w.-]+\.)?shopify\.com|https?:\/\/(?:[\w-]+)\.myshopify\.com)(\/.*)?$/i;
    let targetUrl = 'https://www.shopify.com/fr';
    if (rawUrl && allowedPattern.test(rawUrl)) {
      targetUrl = rawUrl;
    }

    // Debug logging
    console.log('[ParamProxy] shopId:', shopId, '->', targetUrl);

    // Try to fetch the Shopify homepage
    let pageContent = null;
    let fetchSuccessful = false;
    let finalUrl = targetUrl;
    
    try {
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Referer': 'https://accounts.shopify.com/'
        },
        timeout: 10000 // 10 second timeout
      });

      finalUrl = response.url || targetUrl;
      if (response.ok) {
        pageContent = await response.text();
        fetchSuccessful = true;
        console.log('[ParamProxy] Fetched', response.status, response.url, 'X-FRAME-OPTIONS:', response.headers.get('x-frame-options'), 'CSP:', response.headers.get('content-security-policy'));
      } else {
        console.log(`Shopify lookup page returned ${response.status}, using fallback`);
      }
    } catch (fetchError) {
      console.log('Failed to fetch Shopify lookup page, using fallback:', fetchError.message);
    }

    // If fetch failed, use our custom lookup page
    if (!fetchSuccessful || !pageContent) {
      console.log('Using custom lookup page fallback');
      throw new Error('Using fallback'); // This will trigger the fallback HTML
    }

    // Remove all script tags to avoid heavy scripts or frame-busting logic
    const sanitizedHtml = pageContent
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<script[^>]*>/gi, '')
      .replace(/<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '');

    // Inject our adjustments so the page works in iframe
    const modifiedContent = sanitizedHtml.replace(
      '<head>',
      `<head>
        <base href="${finalUrl.endsWith('/') ? finalUrl : finalUrl + '/'}">
        <meta name="referrer" content="same-origin">
        <style>
          /* Ensure the page fits well in iframe */
          body { 
            margin: 0; 
            padding: 10px;
            background: #fff;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
          
          /* Make sure all content is clickable and functional */
          * {
            pointer-events: auto !important;
          }
          
          /* Ensure forms and buttons work properly */
          form, button, input, select, textarea, a {
            pointer-events: auto !important;
            position: relative !important;
            z-index: 10 !important;
          }
          
          /* Hide any potential frame-busting scripts */
          iframe[src*="frame-buster"], 
          script[src*="frame-buster"] {
            display: none !important;
          }
          
          /* Ensure proper scrolling */
          html, body {
            overflow: auto !important;
            height: auto !important;
          }
          
          /* Make sure login buttons and forms are visible */
          .btn, .button, [role="button"], input[type="submit"], input[type="button"] {
            background: #5b73e8 !important;
            color: white !important;
            border: none !important;
            padding: 12px 24px !important;
            border-radius: 4px !important;
            cursor: pointer !important;
            text-decoration: none !important;
            display: inline-block !important;
          }
          
          .btn:hover, .button:hover, [role="button"]:hover, input[type="submit"]:hover {
            background: #4f63d2 !important;
          }
          
          /* Ensure lookup and login forms are visible and functional */
          form[action*="lookup"], form[action*="login"], form[action*="auth"], .lookup-form, .login-form, .auth-form {
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
          }
          
          /* Input fields styling */
          input[type="email"], input[type="password"], input[type="text"] {
            border: 1px solid #ccc !important;
            padding: 8px 12px !important;
            border-radius: 4px !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
        </style>
        <script>
          /* Laissez le navigateur gérer window.top pour éviter les erreurs de sécurité */

          // Ensure all links and forms work in iframe
          document.addEventListener('DOMContentLoaded', function() {
            // Handle all links to stay in frame
            const links = document.querySelectorAll('a');
            links.forEach(link => {
              link.removeAttribute('target');
              if (link.href && (link.href.includes('shopify.com') || link.href.includes('accounts.shopify'))) {
                link.target = '_self';
              }
            });
            
            // Handle all forms to submit in frame
            const forms = document.querySelectorAll('form');
            forms.forEach(form => {
              form.target = '_self';
              form.removeAttribute('target');
            });
            
            // Ensure lookup and login forms are visible and functional
            const lookupForms = document.querySelectorAll('form[action*="lookup"], form[action*="login"], form[action*="auth"], .lookup-form, .login-form');
            lookupForms.forEach(form => {
              form.style.display = 'block';
              form.style.visibility = 'visible';
              form.style.opacity = '1';
            });
            
            // Ensure lookup input field is visible
            const lookupInputs = document.querySelectorAll('input[name*="shop"], input[placeholder*="store"], input[placeholder*="boutique"], input[type="search"]');
            lookupInputs.forEach(input => {
              input.style.display = 'block';
              input.style.visibility = 'visible';
              input.style.opacity = '1';
            });

            /* --------------------------------------------------
               Réécriture des liens pour passer par le proxy afin
               d'éviter X-Frame-Options bloquants lors des navigations.
            -------------------------------------------------- */
            const shopId = '${shopId}';
            function rewriteLink(link) {
              const href = link.getAttribute('href');
              if (!href || href.startsWith('#')) return;

              try {
                const abs = href.startsWith('http') ? href : new URL(href, '${finalUrl}').href;
                if (/shopify\.com|myshopify\.com/i.test(abs)) {
                  const proxied = '/api/shopify/parametrization-page/' + shopId + '?u=' + encodeURIComponent(abs);
                  console.debug('[ParamProxy][link]', abs, '→', proxied);
                  link.removeAttribute('target');
                  link.href = proxied;
                }
              } catch (e) {
                console.warn('[ParamProxy] rewriteLink error:', e);
              }
            }

            const allLinks = document.querySelectorAll('a');
            allLinks.forEach(rewriteLink);

            // Intercept future clicks (for dynamically added links)
            document.addEventListener('click', (ev) => {
              const a = ev.target.closest('a');
              if (a) {
                rewriteLink(a);
                const proxiedHref = a.getAttribute('href');
                if (proxiedHref && proxiedHref.startsWith('/api/shopify/parametrization-page/')) {
                  ev.preventDefault();
                  console.debug('[ParamProxy][click navigate]', proxiedHref);
                  window.location.assign(proxiedHref);
                }
              }
            }, true);

            /* --------------------------------------------------
               Réécriture des formulaires pour qu'ils soumettent via le proxy
            -------------------------------------------------- */
            function rewriteForm(f) {
              const act = f.getAttribute('action') || window.location.href;
              try {
                const abs = act.startsWith('http') ? act : new URL(act, '${finalUrl}').href;
                if (/shopify\.com|myshopify\.com/i.test(abs)) {
                  const proxied = '/api/shopify/parametrization-page/' + shopId + '?u=' + encodeURIComponent(abs);
                  console.debug('[ParamProxy][form]', abs, '→', proxied);
                  f.action = proxied;
                  f.target = '_self';
                }
              } catch(e) { console.warn('[ParamProxy] rewriteForm error', e); }
            }
            const allForms = document.querySelectorAll('form');
            allForms.forEach(rewriteForm);

            document.addEventListener('submit', (ev) => {
              const f = ev.target;
              if (f && f.tagName === 'FORM') {
                rewriteForm(f);
              }
            }, true);

            /* --------------------------------------------------
               Interception de window.location.* pour rediriger via proxy
            -------------------------------------------------- */
            const proxyPrefix = '/api/shopify/parametrization-page/' + shopId + '?u=';
            function proxify(url) {
              try {
                if (/shopify\.com|myshopify\.com/i.test(url)) {
                  return proxyPrefix + encodeURIComponent(url);
                }
              } catch(e) {}
              return url;
            }
            const origAssign = window.location.assign.bind(window.location);
            const origReplace = window.location.replace.bind(window.location);
            window.location.assign = function(url) { origAssign(proxify(url)); };
            window.location.replace = function(url) { origReplace(proxify(url)); };
            Object.defineProperty(window.location, 'href', {
              get() { return origAssign.href; },
              set(url) { origAssign.call(window.location, proxify(url)); }
            });

            /* Intercepter window.open pour qu'il ouvre dans un nouvel onglet plutôt 
               que de tenter dans le même iframe (optionnel) */
            const originalOpen = window.open;
            window.open = function(url, target, feats) {
              const proxied = '/api/shopify/parametrization-page/' + shopId + '?u=' + encodeURIComponent(url);
              console.debug('[ParamProxy][window.open]', url, '→', proxied);
              return originalOpen.call(window, proxied, target || '_self', feats);
            };
 
          // Observer to remove any dynamic attempts at frame busting
            const observer = new MutationObserver(() => {
              const busters = document.querySelectorAll('[onbeforeunload], script');
              busters.forEach(el => {
                if (el.innerText && /top\.location|parent\.location/.test(el.innerText)) {
                  el.remove();
                }
              });
            });
            observer.observe(document.documentElement, { subtree: true, childList: true });

            /* --------------------------------------------------
               Réécriture des <iframe> internes pour passer par le proxy
            -------------------------------------------------- */
            function rewriteIframe(el) {
              const src = el.getAttribute('src');
              if (!src) return;
              try {
                const abs = src.startsWith('http') ? src : new URL(src, '${finalUrl}').href;
                if (/shopify\.com|myshopify\.com/i.test(abs)) {
                  const proxied = '/api/shopify/parametrization-page/' + shopId + '?u=' + encodeURIComponent(abs);
                  console.debug('[ParamProxy][iframe]', abs, '→', proxied);
                  el.src = proxied;
                }
              } catch(e) { console.warn('[ParamProxy] rewriteIframe error', e); }
            }

            document.querySelectorAll('iframe').forEach(rewriteIframe);

            const iframeObs = new MutationObserver((mutList) => {
              mutList.forEach(m => {
                m.addedNodes.forEach(node => {
                  if (node.tagName === 'IFRAME') rewriteIframe(node);
                  if (node.querySelectorAll) node.querySelectorAll('iframe').forEach(rewriteIframe);
                });
              });
            });
            iframeObs.observe(document.body, { childList: true, subtree: true });
          });
        </script>`
    );

    // Set proper headers for iframe embedding
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    // res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
    
    res.send(modifiedContent);

  } catch (error) {
    console.error('Error serving Shopify parametrization page:', error);
    
    // Fallback HTML if we can't fetch the real page
    const fallbackHtml = `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Accès Shopify - ${shopName}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 40px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container {
            background: white;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            max-width: 600px;
            text-align: center;
          }
          h1 {
            color: #2d3748;
            margin-bottom: 20px;
          }
          .cta-button {
            background: #5b73e8;
            color: white;
            padding: 15px 30px;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            margin: 20px 10px;
            transition: background 0.3s;
          }
          .cta-button:hover {
            background: #4f63d2;
            color: white;
          }
          .info-box {
            background: #f7fafc;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            text-align: left;
          }
        </style>
      </head>
      <body>
                <div class="container">
          <h1>🔍 Recherche de boutique Shopify</h1>
          <p>Trouvez votre boutique <strong>${shopName}</strong> ou créez votre compte.</p>
          
          <div class="lookup-form">
            <h3>🏪 Rechercher une boutique existante</h3>
            <form onsubmit="searchShop(event)" style="margin: 20px 0;">
              <input 
                type="text" 
                id="shop-name" 
                placeholder="Nom de votre boutique (ex: ma-boutique)" 
                style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 6px; margin-bottom: 10px; font-size: 16px;"
                required
              />
              <button type="submit" class="cta-button" style="width: 100%; margin: 0;">
                🔍 Rechercher ma boutique
              </button>
            </form>
            <p style="font-size: 14px; color: #666; text-align: center;">
              Entrez le nom de votre boutique sans '.myshopify.com'
            </p>
          </div>
          
          <div class="info-box">
            <h3>🆕 Ou créez une nouvelle boutique</h3>
            <p>Si vous n'avez pas encore de boutique Shopify :</p>
            <a href="https://www.shopify.com/fr/essai-gratuit" target="_blank" class="cta-button">
              Commencer l'essai gratuit
            </a>
          </div>
          
          <div class="info-box">
            <h3>📋 Étapes suivantes :</h3>
            <ol style="text-align: left; padding-left: 20px;">
              <li>Recherchez votre boutique ci-dessus</li>
              <li>Connectez-vous avec vos identifiants</li>
              <li>Accédez à votre administration</li>
              <li>Suivez les étapes de configuration</li>
            </ol>
          </div>
          
          <div class="info-box">
            <h3>🔗 Liens utiles</h3>
            <a href="https://accounts.shopify.com/lookup" target="_blank" class="cta-button" style="margin: 5px; display: inline-block;">
              Page de recherche officielle
            </a>
            <a href="https://admin.shopify.com/" target="_blank" class="cta-button" style="margin: 5px; display: inline-block;">
              Administration Shopify
            </a>
          </div>
          
          <script>
            function searchShop(event) {
              event.preventDefault();
              const shopName = document.getElementById('shop-name').value.trim();
              if (shopName) {
                // Clean the shop name (remove spaces, special chars)
                const cleanShopName = shopName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
                const shopUrl = 'https://' + cleanShopName + '.myshopify.com/admin';
                window.open(shopUrl, '_blank');
              }
            }
          </script>
          
          <p><small>💡 Conseil: Ouvrez les liens dans un nouvel onglet pour conserver cet assistant ouvert</small></p>
        </div>
      </body>
      </html>
    `;
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(fallbackHtml);
    }
});

module.exports = router;

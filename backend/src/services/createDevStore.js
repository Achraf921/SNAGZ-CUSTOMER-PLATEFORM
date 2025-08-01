const puppeteer = require('puppeteer');
const { logger } = require('../utils/secureLogger');
const { createSession, getSession, deleteSession } = require('./shopifySessionManager');

// Simple delay helper
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Starts creation. If 2FA required, returns { requires2FA:true, sessionId }
 * If CAPTCHA required, returns { requiresCaptcha:true, sessionId, captchaUrl }
 * else { requires2FA:false, domain, adminUrl }
 */
async function startDevStore(storeName, meta) {
  const email    = process.env.SHOPIFY_PARTNER_EMAIL;
  const password = process.env.SHOPIFY_PARTNER_PASSWORD;

  if (!email || !password) {
    throw new Error('Missing SHOPIFY_PARTNER_EMAIL or SHOPIFY_PARTNER_PASSWORD env vars');
  }

  // Store validation data globally for access during the automation process
  global.currentShopValidation = { meta, storeName };
  logger.debug('[DevStore] Données de validation stockées:', { shopId: meta?.shopId, customerId: meta?.customerId });

  // Launch chromium in headless mode (can be switched off for debugging)
  const browser = await puppeteer.launch({
    headless: process.env.PPTR_HEADLESS === 'false' ? false : 'new',
    slowMo: process.env.PPTR_SLOWMO ? Number(process.env.PPTR_SLOWMO) : 0,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--single-process',
      '--no-zygote',
    ],
  });
  const page    = await browser.newPage();

  try {
    /* 1. Start from Shopify homepage and navigate to login */
    const homepageUrl = 'https://www.shopify.com/fr';
    logger.debug('[DevStore] ouverture page d\'accueil Shopify', homepageUrl);
    await page.goto(homepageUrl);

    // Look for and click the "Se connecter" (Log in) button
    logger.info("DevStore: recherche du bouton "Se connecter"");
    const loginButtonClicked = await page.evaluate(() => {
      // Look for login button with various possible selectors
      const possibleSelectors = [
        'a[href*="login"]',
        'a[href*="connexion"]', 
        'button:contains("Se connecter")',
        'a:contains("Se connecter")',
        'button:contains("Log in")',
        'a:contains("Log in")',
        '[data-testid*="login"]',
        '[data-testid*="signin"]'
      ];
      
      // First try exact text matches
      const elements = Array.from(document.querySelectorAll('a, button'));
      for (const element of elements) {
        const text = (element.innerText || element.textContent || '').trim().toLowerCase();
        if (text === 'se connecter' || text === 'log in' || text === 'connexion') {
          logger.debug('[DevStore] Trouvé bouton login:', text);
          element.click();
          return true;
        }
      }
      
      // Then try selector-based approach
      for (const selector of possibleSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          logger.debug('[DevStore] Trouvé bouton login via sélecteur:', selector);
          element.click();
          return true;
        }
      }
      
      return false;
    });

    if (loginButtonClicked) {
      logger.debug("DevStore: bouton login cliqué, attente navigation");
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });
        logger.debug('[DevStore] navigation réussie vers:', page.url());
      } catch (err) {
        logger.warn('[DevStore] timeout navigation après clic login:', err.message);
      }
    } else {
      logger.warn('[DevStore] bouton login non trouvé, tentative navigation directe...');
      // Fallback: try direct navigation to accounts page
      await page.goto('https://accounts.shopify.com/lookup');
    }

    logger.debug('[DevStore] page de login atteinte:', page.url());

    /* ------------------------------------------------------------------
       Étape de connexion – ignorée si déjà loggé                     
    ------------------------------------------------------------------*/
    if (await page.$('input#account_email')) {
      logger.info("DevStore: saisie email");
      await page.type('input#account_email', email);
      await page.click('button[type="submit"]'); // bouton "Continuer / Next"

      // Wait a moment and check for CAPTCHA loading error
      await sleep(2000);
      
      const captchaLoadError = await page.evaluate(() => {
        const bodyText = document.body.innerText || document.body.textContent || '';
        return bodyText.includes('Impossible de charger le captcha. Actualisez la page et réessayez.');
      });

      if (captchaLoadError) {
        logger.info("DevStore: CAPTCHA loading error detected - refreshing page and streaming current window");
        
        // Refresh the page to fix the CAPTCHA loading issue
        await page.reload({ waitUntil: 'networkidle0' });
        await sleep(2000);
        
        // The page should now show the working CAPTCHA - stream this current window to user
        logger.info("DevStore: Page refreshed - streaming current window with working CAPTCHA to user");
        const sessionId = createSession(page, { ...meta, storeName, step: 'captcha_reload' });
        return { 
          requiresCaptcha: true, 
          sessionId,
          captchaUrl: page.url(),
          message: 'CAPTCHA reloaded - résolvez le CAPTCHA dans la fenêtre actuelle'
        };
      }

      // Wait for either password field, captcha, or navigation
      const captchaTimeout = 10000; // 10s max pour détecter captcha
      const startTs = Date.now();
      let captchaDetected = false;
      let passwordFieldFound = false;

      while (Date.now() - startTs < captchaTimeout && !captchaDetected && !passwordFieldFound) {
        await sleep(500);
        const currentUrl = page.url();
        
        // Check for CAPTCHA indicators - be more strict
        const hasCaptchaInUrl = /captcha_failed=true|captcha=true/.test(currentUrl);
        const passwordFieldExists = await page.$('input#account_password');
        
        const hasCaptchaElements = await page.evaluate(() => {
          // Look for actual CAPTCHA elements (not just any form)
          const captchaSelectors = [
            '[class*="captcha"]',
            '[id*="captcha"]',
            '[class*="recaptcha"]',
            '[id*="recaptcha"]',
            'iframe[src*="recaptcha"]',
            'iframe[src*="captcha"]',
            '.g-recaptcha',
            '#recaptcha',
            '[data-sitekey]',
            'form[action*="captcha"]'
          ];
          
          return captchaSelectors.some(selector => document.querySelector(selector));
        });

        // Only trigger CAPTCHA if:
        // 1. URL explicitly mentions captcha failure, OR
        // 2. CAPTCHA elements are present AND no password field available
        const isCaptcha = (hasCaptchaInUrl || hasCaptchaElements) && !passwordFieldExists;

        if (isCaptcha) {
          captchaDetected = true;
          logger.debug('[DevStore] REAL CAPTCHA detected at URL:', currentUrl);
          logger.debug('[DevStore] CAPTCHA in URL:', hasCaptchaInUrl);
          logger.debug('[DevStore] CAPTCHA elements found:', hasCaptchaElements);
          logger.debug('[DevStore] Password field exists:', !!passwordFieldExists);
          
          // Debug: check what's actually on the page
          const pageContent = await page.evaluate(() => {
            return {
              title: document.title,
              hasEmailField: !!document.querySelector('input#account_email'),
              hasPasswordField: !!document.querySelector('input#account_password'),
              hasForms: document.querySelectorAll('form').length,
              bodyText: document.body.innerText.substring(0, 200)
            };
          });
          logger.debug('[DevStore] Page content debug:', pageContent);
          
          break;
        }

        // Check if password field appeared (normal flow)
        if (passwordFieldExists) {
          passwordFieldFound = true;
          logger.info("DevStore: Password field found - proceeding with normal flow");
          break;
        }
      }

      if (captchaDetected) {
        logger.info("DevStore: CAPTCHA required → creating session for manual solving");
        const sessionId = createSession(page, { ...meta, storeName, step: 'captcha' });
        return { 
          requiresCaptcha: true, 
          sessionId,
          captchaUrl: page.url(),
          message: 'CAPTCHA détecté - résolution manuelle requise'
        };
      }

      if (!passwordFieldFound) {
        // Wait a bit more for password field
        try {
          await page.waitForSelector('input#account_password', { timeout: 30000 });
        } catch (err) {
          throw new Error('Password field not found after email submission - check email or network');
        }
      }

      logger.info("DevStore: saisie password");
      await page.type('input#account_password', password);
      // Cliquez puis attendez soit le dashboard, soit la demande OTP (race)
      await page.click('button[type="submit"]');

      const OTP_SELECTOR = 'input#account_otp, input[name*="otp" i], input[autocomplete="one-time-code"], input[type="tel"], input[type="text"], input[type="password"]';

      const detectionTimeout = 5000; // 5s max pour détecter 2FA
      const startTs2FA = Date.now();
      let twoFA = false;
      while (Date.now() - startTs2FA < detectionTimeout && !twoFA) {
        await sleep(500);
        const url = page.url();
        const twoFactorInUrl = /two[-]?factor|verification_code|mfa/i.test(url);
        const otpEl = await page.$(OTP_SELECTOR);
        if (twoFactorInUrl || otpEl) {
          twoFA = true;
          break;
        }
      }

      logger.info("DevStore: 2FA detected ?', twoFA, 'after', Date.now() - startTs2FA, 'ms");

      if (twoFA) {
        const sessionId = createSession(page, { ...meta, storeName });
        return { requires2FA: true, sessionId };
      }

      // Si navigation sans OTP => connecté
      logger.info("DevStore: authentification réussie (sans 2FA)");
    } else {
      logger.info("DevStore: déjà authentifié");
    }

    /* Après authentification, navigation directe vers la page de création */
    logger.debug("DevStore: authentification réussie, navigation vers page de création");
    
    // Force navigate to the specific admin page with no_redirect
    await page.goto('https://admin.shopify.com/?no_redirect=true');
    logger.debug('[DevStore] navigation vers admin avec no_redirect, URL:', page.url());
    
    await page.waitForSelector('body', { timeout: 20000 });
    await sleep(2000); // Wait for page to fully load

    /* 2. Look for "Créer une boutique" button */
    logger.debug("DevStore: recherche bouton "Créer une boutique"");
    
    // Look for "Créer une boutique" button specifically
    const createStoreClicked = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('a, button, div[role="button"], [role="link"]'));
      
      for (const element of elements) {
        const text = (element.innerText || element.textContent || '').trim().toLowerCase();
        
        logger.debug('[DevStore] Checking element:', text.substring(0, 50));
        
        if (text === 'créer une boutique' || 
            text === 'create store' ||
            text === 'create a store' ||
            text.includes('créer une boutique') ||
            text.includes('create store')) {
          logger.debug('[DevStore] Trouvé "Créer une boutique":', text);
          element.click();
          return true;
        }
      }
      
      // Also look for any element with "boutique" and "créer" in the same text
      for (const element of elements) {
        const text = (element.innerText || element.textContent || '').trim().toLowerCase();
        
        if (text.includes('créer') && text.includes('boutique')) {
          logger.debug('[DevStore] Trouvé bouton création avec "créer" et "boutique":', text);
          element.click();
          return true;
        }
      }
      
      logger.info("DevStore: "Créer une boutique" non trouvé");
      return false;
    });

    if (createStoreClicked) {
      logger.debug("DevStore: bouton "Créer une boutique" cliqué, attente navigation");
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });
        logger.debug('[DevStore] navigation réussie vers:', page.url());
      } catch (err) {
        logger.warn('[DevStore] timeout navigation, mais continuons:', err.message);
      }
    } else {
      // If button not found, log what's available on the page for debugging
      logger.warn('[DevStore] bouton "Créer une boutique" non trouvé');
      
      const pageContent = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('a, button, div[role="button"]'));
        return {
          url: window.location.href,
          title: document.title,
          buttonTexts: buttons.map(b => (b.innerText || b.textContent || '').trim()).filter(t => t.length > 0).slice(0, 10)
        };
      });
      logger.debug('[DevStore] Debug - contenu de la page:', pageContent);
      
      // Try to find any button related to store creation as fallback
      const fallbackClicked = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('a, button, div[role="button"]'));
        
        for (const element of elements) {
          const text = (element.innerText || element.textContent || '').toLowerCase();
          
          if (text.includes('boutique') || 
              text.includes('store') ||
              text.includes('développement') ||
              text.includes('development')) {
            logger.debug('[DevStore] Fallback: clic sur', text);
            element.click();
            return true;
          }
        }
        return false;
      });
      
      if (fallbackClicked) {
        await sleep(1000); // Reduced from 3000ms
      }
    }

    // Check if we're on a signup page first
    const currentUrl = page.url();
    if (currentUrl.includes('/signup/') || currentUrl.includes('signup_types')) {
      logger.debug("DevStore: Detected signup page, handling signup form first");
      
      // Wait for signup form to load
      await page.waitForSelector('body', { timeout: 15000 }); // Reduced timeout from 20000ms
      await sleep(800); // Reduced from 2000ms
      
      // Look for store name input and fill it
      const storeNameFilled = await page.evaluate((storeName) => {
        const inputs = Array.from(document.querySelectorAll('input[type="text"], input[name*="name"], input[placeholder*="nom"], input[placeholder*="name"]'));
        
        for (const input of inputs) {
          const placeholder = (input.placeholder || '').toLowerCase();
          const name = (input.name || '').toLowerCase();
          
          if (placeholder.includes('nom') || placeholder.includes('name') || 
              name.includes('name') || name.includes('store')) {
            logger.debug('[DevStore] Remplissage nom boutique signup:', storeName);
            input.value = storeName;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
        return false;
      }, storeName);
      
      if (storeNameFilled) {
        await sleep(300); // Reduced from 1000ms
        
        // Look for and click submit/continue button
        const signupSubmitted = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], div[role="button"]'));
          
          for (const button of buttons) {
            const text = (button.innerText || button.textContent || button.value || '').toLowerCase();
            
            if (text.includes('créer') || text.includes('create') || 
                text.includes('continuer') || text.includes('continue') ||
                text.includes('suivant') || text.includes('next') ||
                button.type === 'submit') {
              logger.debug('[DevStore] Soumission formulaire signup:', text);
              button.click();
              return true;
            }
          }
          return false;
        });
        
        if (signupSubmitted) {
          logger.debug("DevStore: Formulaire signup soumis, attente navigation");
          try {
            await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }); // Reduced timeout from 30000ms
          } catch (err) {
            logger.warn('[DevStore] Timeout navigation après signup');
          }
          await sleep(1000); // Reduced from 3000ms
        }
      }
    }

    // Handle the setup wizard sequence
    logger.debug("DevStore: gestion du wizard de configuration");
    
    // Quick check if we're already in admin interface
    const pageUrl = page.url();
    if (pageUrl.includes('/admin') && !pageUrl.includes('/signup')) {
      logger.info("DevStore: Déjà dans l\'interface admin, pas de wizard nécessaire");
      await updateShopNameInSettings(page, storeName);
      return;
    }
    
    // Wait for wizard to load (reduced from 3000ms)
    await sleep(1000);
    
    // First, let's debug what's actually on the page
    // Quick page analysis (optimized for speed)
    logger.debug("DevStore: Analyse rapide de la page");
    const pageInfo = await page.evaluate(() => ({
      url: window.location.href,
      title: document.title,
      hasRadios: document.querySelectorAll('input[type="radio"]').length > 0,
      hasCheckboxes: document.querySelectorAll('input[type="checkbox"]').length > 0,
      hasButtons: document.querySelectorAll('button').length > 0,
      pageText: document.body.innerText.slice(0, 200) // Get sample text
    }));
    
    logger.debug('[DevStore] Page info:', pageInfo);
    
    // Check if this is actually a wizard page
    if (!pageInfo.hasRadios && !pageInfo.hasCheckboxes) {
      logger.info("DevStore: Pas d\'éléments de formulaire détectés, peut-être pas une page wizard");
      logger.debug('[DevStore] Texte de la page:', pageInfo.pageText);
      
      // If already on admin page, skip wizard
      if (pageInfo.url.includes('/admin') && !pageInfo.url.includes('/signup')) {
        logger.debug("DevStore: Déjà sur la page admin, mise à jour du nom");
        await updateShopNameInSettings(page, storeName);
        
        const adminUrl = page.url();
        const match = adminUrl.match(/^https:\/\/(.*?)\..*?\/admin/) || adminUrl.match(/^https:\/\/admin\.shopify\.com\/store\/(.*?)(?:\?|\/|$)/);
        if (match) {
          const domain = match[1];
          await page.browser().close();
          return { domain, adminUrl, storeName, meta };
        }
      }
    }
    
    // Step 1: "Sur quels canaux souhaitez‑vous vendre ?" - click "Une boutique en ligne"
    logger.debug("DevStore: Étape 1: Recherche "Une boutique en ligne"");
    
    // Try multiple approaches for Step 1 with timeout
    let boutiqueLigneClicked = false;
    
    // Quick attempt - just click first radio/checkbox if exists
    if (pageInfo.hasRadios || pageInfo.hasCheckboxes) {
      boutiqueLigneClicked = await page.evaluate(() => {
        const firstInput = document.querySelector('input[type="radio"], input[type="checkbox"]');
        if (firstInput) {
          logger.info("DevStore: Clic rapide sur premier input disponible");
          firstInput.click();
          return true;
        }
        return false;
      });
    }
    
    if (!boutiqueLigneClicked) {
      // Approach 1: Look for radio buttons or checkboxes with relevant text
      boutiqueLigneClicked = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]'));
        
        for (const input of inputs) {
          const label = input.labels?.[0]?.textContent || '';
          const parent = input.closest('div, label, li, section')?.textContent || '';
          const combined = (label + ' ' + parent).toLowerCase();
          
          if (combined.includes('boutique en ligne') || combined.includes('online store') ||
              combined.includes('boutique') && combined.includes('ligne')) {
            logger.debug('[DevStore] Trouvé input boutique en ligne:', input.type, combined.slice(0, 100));
            input.click();
            return true;
          }
        }
        return false;
      });
    }
    
    if (!boutiqueLigneClicked) {
      // Approach 2: Look for clickable divs/containers with the text
      boutiqueLigneClicked = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('div, li, section, label'));
        
        for (const element of elements) {
          const text = (element.innerText || element.textContent || '').trim();
          
          if (text.includes('Une boutique en ligne') || 
              (text.includes('boutique') && text.includes('ligne')) ||
              text.includes('Créez un site web entièrement personnalisable')) {
            
            logger.debug('[DevStore] Trouvé élément boutique en ligne:', element.tagName, text.slice(0, 100));
            
            // Try to find associated input
            const input = element.querySelector('input') || 
                         element.closest('label')?.querySelector('input') ||
                         element.closest('div')?.querySelector('input');
            
            if (input) {
              logger.debug('[DevStore] Clic sur input associé:', input.type);
              input.click();
            } else {
              logger.info("DevStore: Clic direct sur élément");
              element.click();
            }
            return true;
          }
        }
        return false;
      });
    }
    
    if (!boutiqueLigneClicked) {
      // Approach 3: Just click the first radio button or checkbox (fallback)
      boutiqueLigneClicked = await page.evaluate(() => {
        const firstInput = document.querySelector('input[type="radio"], input[type="checkbox"]');
        if (firstInput) {
          logger.info("DevStore: Fallback: clic sur premier input");
          firstInput.click();
          return true;
        }
        return false;
      });
    }

    logger.info("DevStore: Étape 1 résultat:', boutiqueLigneClicked ? 'Succès' : 'Échec");

    if (boutiqueLigneClicked) {
      await sleep(500); // Reduced from 2000ms
      
      // Click "Suivant" button for step 1
      logger.debug("DevStore: Recherche bouton "Suivant" étape 1");
      const suivantClicked1 = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], div[role="button"], a'));
        
        for (const button of buttons) {
          const text = (button.innerText || button.textContent || button.value || '').trim().toLowerCase();
          
          if (text === 'suivant' || text === 'next' || text.includes('suivant') || text.includes('continue')) {
            logger.debug('[DevStore] Clic "Suivant" étape 1:', text);
            button.click();
            return true;
          }
        }
        
        // Fallback: look for any button that might advance
        for (const button of buttons) {
          const text = (button.innerText || button.textContent || button.value || '').trim();
          if (text.length > 0 && text.length < 20) { // Reasonable button text
            logger.debug('[DevStore] Fallback button click:', text);
            button.click();
            return true;
          }
        }
        
        return false;
      });

      logger.info("DevStore: Bouton suivant étape 1:', suivantClicked1 ? 'Cliqué' : 'Non trouvé");
      
      // Continue with remaining steps only if we successfully completed step 1
      if (suivantClicked1) {
        logger.debug("DevStore: Prêt pour étape 2 - attente du chargement");
        await sleep(1000); // Reduced from 3000ms
        
        // Call the wizard handler for remaining steps
        logger.debug("DevStore: Continuation avec le gestionnaire de wizard");
        const wizardResult = await handleAllWizardSteps(page, storeName);
        if (wizardResult && wizardResult.success) {
          await page.browser().close();
          return { domain: wizardResult.domain, adminUrl: wizardResult.adminUrl, storeName, meta };
        }
        // If wizard fails, continue with fallback form handling
      }
    } else {
      logger.warn('[DevStore] Étape 1 échouée - impossible de trouver "Une boutique en ligne"');
    }

    // After wizard, wait for store creation form or admin page
    logger.debug("DevStore: recherche formulaire de création ou page admin finale");
    
    const storeFormFound = await page.waitForSelector([
      'input[name="development_store[name]"]',
      'input[placeholder*="nom"]',
      'input[placeholder*="name"]',
      'input[type="text"]',
      'body' // fallback
    ].join(', '), { 
      timeout: 10000, // Reduced from 60000ms
      visible: true 
    }).catch(() => null);

    if (!storeFormFound) {
      // If form not found, might need to look for it in different ways
      logger.debug("DevStore: formulaire standard non trouvé, recherche alternative");
      
      const alternativeForm = await page.evaluate(() => {
        // Look for any input that might be for store name
        const inputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'));
        for (const input of inputs) {
          const placeholder = (input.placeholder || '').toLowerCase();
          const label = input.labels?.[0]?.textContent?.toLowerCase() || '';
          const name = (input.name || '').toLowerCase();
          
          if (placeholder.includes('nom') || 
              placeholder.includes('name') ||
              label.includes('nom') ||
              label.includes('name') ||
              name.includes('name') ||
              name.includes('store')) {
            return true;
          }
        }
        return false;
      });
      
      if (!alternativeForm) {
        throw new Error('Formulaire de création de boutique non trouvé');
      }
    }

    // Input store name
    logger.debug('[DevStore] saisie nom boutique:', storeName);
    
    const nameInputted = await page.evaluate((storeName) => {
      // Try different input selectors
      const selectors = [
        'input[name="development_store[name]"]',
        'input[placeholder*="nom"]',
        'input[placeholder*="name"]',
        'input[type="text"]'
      ];
      
      for (const selector of selectors) {
        const input = document.querySelector(selector);
        if (input && input.offsetParent !== null) { // visible element
          input.value = storeName;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      
      // Alternative: find by context
      const inputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'));
      for (const input of inputs) {
        const placeholder = (input.placeholder || '').toLowerCase();
        const label = input.labels?.[0]?.textContent?.toLowerCase() || '';
        
        if (placeholder.includes('nom') || placeholder.includes('name') ||
            label.includes('nom') || label.includes('name')) {
          input.value = storeName;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      
      return false;
    }, storeName);

    if (!nameInputted) {
      throw new Error('Impossible de saisir le nom de la boutique');
    }

    // Submit form
    logger.info("DevStore: soumission du formulaire");
    
    const submitted = await page.evaluate(() => {
      // Look for submit button
      const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
      
      for (const button of buttons) {
        const text = (button.innerText || button.textContent || button.value || '').toLowerCase();
        const type = button.type || '';
        
        if (type === 'submit' ||
            text.includes('créer') ||
            text.includes('create') ||
            text.includes('submit') ||
            text.includes('envoyer')) {
          button.click();
          return true;
        }
      }
      
      // Fallback: try Enter key
      const form = document.querySelector('form');
      if (form) {
        const event = new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13 });
        form.dispatchEvent(event);
        return true;
      }
      
      return false;
    });

    if (!submitted) {
      throw new Error('Impossible de soumettre le formulaire de création');
    }

    // Wait for store creation completion
    logger.debug("DevStore: attente création boutique");
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 300000 }); // 5 minutes max

    const adminUrl = page.url();
    logger.debug('[DevStore] URL finale:', adminUrl);
    
    // Extract domain from admin URL
    const match = adminUrl.match(/^https:\/\/(.*?)\..*?\/admin/) || adminUrl.match(/^https:\/\/admin\.shopify\.com\/store\/(.*?)(?:\?|\/|$)/);
    if (!match) {
      throw new Error(`Cannot detect domain from URL: ${adminUrl}`);
    }
    
    const domain = match[1];
    logger.debug('[DevStore] domaine détecté:', domain);

    await page.browser().close();
    
    // Clean up global validation data
    global.currentShopValidation = null;
    
    return { domain, adminUrl, storeName, meta };
  } catch (err) {
    logger.error('[DevStore] erreur:', err);
    await page.browser().close();
    
    // Clean up global validation data
    global.currentShopValidation = null;
    
    throw err;
  }
}

/**
 * Continues a paused session after user solved the CAPTCHA manually.
 */
async function continueCaptcha(sessionId) {
  const sess = getSession(sessionId);
  if (!sess) throw new Error('session not found');

  let { page } = sess;
  const { meta } = sess;
  
  // Store validation data globally for access during the automation process
  global.currentShopValidation = { meta, storeName: meta.storeName };
  logger.debug('[DevStore] Données de validation restaurées:', { shopId: meta?.shopId, customerId: meta?.customerId });

  try {
    // Wait for user to solve captcha manually and page to navigate
    logger.debug("DevStore: Waiting for CAPTCHA to be solved");
    
    // Wait for navigation away from captcha page
    const waitForCaptchaSolution = async () => {
      const maxWaitTime = 300000; // 5 minutes max
      const startTime = Date.now();
      
      while (Date.now() - startTime < maxWaitTime) {
        const currentUrl = page.url();
        
        // Check if we're no longer on a captcha page (use strict detection)
        const hasCaptchaInUrl = /captcha_failed=true|captcha=true/.test(currentUrl);
        const hasCaptchaElements = await page.evaluate(() => {
          const captchaSelectors = [
            '[class*="captcha"]',
            '[id*="captcha"]',
            '[class*="recaptcha"]',
            '[id*="recaptcha"]',
            'iframe[src*="recaptcha"]',
            'iframe[src*="captcha"]',
            '.g-recaptcha',
            '#recaptcha',
            '[data-sitekey]'
          ];
          return captchaSelectors.some(selector => document.querySelector(selector));
        });
        
        const stillOnCaptcha = hasCaptchaInUrl || hasCaptchaElements;
        
        if (!stillOnCaptcha) {
          // Check if we have either "se connecter avec email" button or password field
          const hasEmailLoginButton = await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('a, button, div[role="button"], [role="link"]'));
            return elements.some(element => {
              const text = (element.innerText || element.textContent || '').trim().toLowerCase();
              return text.includes('se connecter avec email') || 
                     text.includes('se connecter avec e-mail') ||
                     text.includes('log in with email') ||
                     text === 'se connecter avec email';
            });
          });
          
          const passwordFieldExists = await page.$('input#account_password');
          
          if (hasEmailLoginButton || passwordFieldExists) {
            logger.info("DevStore: CAPTCHA solved - login options available");
            return true;
          }
        }
        
        await sleep(2000); // Check every 2 seconds
      }
      
      throw new Error('CAPTCHA solution timeout - please try again');
    };

    await waitForCaptchaSolution();

    // After CAPTCHA is solved, look for "se connecter avec email" button
    const password = process.env.SHOPIFY_PARTNER_PASSWORD;
    
    logger.info("DevStore: Looking for "se connecter avec email" button after CAPTCHA");
    const emailLoginClicked = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('a, button, div[role="button"], [role="link"]'));
      for (const element of elements) {
        const text = (element.innerText || element.textContent || '').trim().toLowerCase();
        
        // Look specifically for "se connecter avec email" or similar variations
        if (text.includes('se connecter avec email') || 
            text.includes('se connecter avec e-mail') ||
            text.includes('log in with email') ||
            text.includes('continuer avec email') ||
            text.includes('continue with email') ||
            text === 'se connecter avec email' ||
            text === 'se connecter avec e-mail') {
          logger.debug('[DevStore] Found "se connecter avec email" button:', text);
          element.click();
          return true;
        }
      }
      return false;
    });
    
    if (emailLoginClicked) {
      logger.info("DevStore: "Se connecter avec email" button clicked");
      try {
        // Wait for password field to appear after clicking "se connecter avec email"
        await page.waitForSelector('input#account_password', { timeout: 30000 });
        logger.info("DevStore: Password field available after clicking "se connecter avec email"");
      } catch (err) {
        throw new Error('Password field not found after clicking "se connecter avec email"');
      }
    } else {
      logger.info("DevStore: "Se connecter avec email" button not found, checking if password field is already available");
      // Check if password field is already available
      const passwordField = await page.$('input#account_password');
      if (!passwordField) {
        throw new Error('Neither "se connecter avec email" button nor password field found after CAPTCHA');
      }
    }

    // Now continue with password entry
    logger.info("DevStore: saisie password après résolution CAPTCHA");
    await page.type('input#account_password', password);
    await page.click('button[type="submit"]');

    const OTP_SELECTOR = 'input#account_otp, input[name*="otp" i], input[autocomplete="one-time-code"], input[type="tel"], input[type="text"], input[type="password"]';

    const detectionTimeout = 5000; // 5s max pour détecter 2FA
    const startTs = Date.now();
    let twoFA = false;
    while (Date.now() - startTs < detectionTimeout && !twoFA) {
      await sleep(500);
      const url = page.url();
      const twoFactorInUrl = /two[-]?factor|verification_code|mfa/i.test(url);
      const otpEl = await page.$(OTP_SELECTOR);
      if (twoFactorInUrl || otpEl) {
        twoFA = true;
        break;
      }
    }

    if (twoFA) {
      // Update session step and return 2FA requirement
      sess.meta = { ...sess.meta, step: '2fa' };
      return { requires2FA: true, sessionId };
    }

    // Continue with store creation after CAPTCHA - direct navigation
    logger.debug("DevStore: continuation après CAPTCHA");
    
    // Force navigate to the admin page with no_redirect
    await page.goto('https://admin.shopify.com/?no_redirect=true');
    logger.debug('[DevStore] navigation vers admin après CAPTCHA, URL:', page.url());
    
    await page.waitForSelector('body', { timeout: 20000 });
    await sleep(2000);

    // Look for "Créer une boutique" button
    const createStoreClicked = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('a, button, div[role="button"], [role="link"]'));
      
      for (const element of elements) {
        const text = (element.innerText || element.textContent || '').trim().toLowerCase();
        
        if (text === 'créer une boutique' || text.includes('créer une boutique') ||
            text === 'create store' || text.includes('create store')) {
          logger.debug('[DevStore] Trouvé "Créer une boutique" après CAPTCHA:', text);
          element.click();
          return true;
        }
      }
      return false;
    });

    if (createStoreClicked) {
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });
      } catch (err) {
        logger.warn('[DevStore] timeout navigation après CAPTCHA');
      }
    }

    // Wait for store creation form
    await page.waitForSelector([
      'input[name="development_store[name]"]',
      'input[placeholder*="nom"]', 
      'input[placeholder*="name"]',
      'input[type="text"]'
    ].join(', '), { timeout: 60000 });

    // Input store name using evaluate for better reliability
    const nameInputted = await page.evaluate((storeName) => {
      const selectors = [
        'input[name="development_store[name]"]',
        'input[placeholder*="nom"]',
        'input[placeholder*="name"]',
        'input[type="text"]'
      ];
      
      for (const selector of selectors) {
        const input = document.querySelector(selector);
        if (input && input.offsetParent !== null) {
          input.value = storeName;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      return false;
    }, meta.storeName);

    if (!nameInputted) {
      throw new Error('Store name input not found after CAPTCHA');
    }

    // Submit form
    const submitted = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
      for (const button of buttons) {
        const text = (button.innerText || button.textContent || button.value || '').toLowerCase();
        const type = button.type || '';
        
        if (type === 'submit' ||
            text.includes('créer') || text.includes('create') ||
            text.includes('submit') || text.includes('envoyer')) {
          button.click();
          return true;
        }
      }
      return false;
    });

    if (!submitted) {
      throw new Error('Impossible de soumettre le formulaire après CAPTCHA');
    }

    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 300000 });

    const adminUrl = page.url();
    const match = adminUrl.match(/^https:\/\/(.*?)\/admin/);
    if (!match) throw new Error('cannot detect domain after CAPTCHA');
    const domain = match[1];

    await page.browser().close();
    deleteSession(sessionId);
    
    // Clean up global validation data
    global.currentShopValidation = null;

    return { domain, adminUrl, storeName: meta.storeName, meta };
  } catch (err) {
    await page.browser().close();
    deleteSession(sessionId);
    
    // Clean up global validation data
    global.currentShopValidation = null;
    
    throw err;
  }
}

/**
 * Continues a paused session after user provided the 2FA code.
 */
async function continueDevStore(sessionId, code) {
  const sess = getSession(sessionId);
  if (!sess) throw new Error('session not found');

  let { page } = sess;
  const { meta } = sess;
  
  // Store validation data globally for access during the automation process
  global.currentShopValidation = { meta, storeName: meta.storeName };
  logger.debug('[DevStore] Données de validation restaurées:', { shopId: meta?.shopId, customerId: meta?.customerId });
  const rootPage = page; // conserve la page principale

  try {
    const OTP_SELECTOR = 'input#account_otp, input[name*="otp" i], input[autocomplete="one-time-code"], input[type="tel"], input[type="text"], input[type="password"]';

    let targetPage = page;
    let otpInput = await targetPage.$(OTP_SELECTOR);
    if (!otpInput) {
      // parcourir les iframes
      for (const frame of page.frames()) {
        otpInput = await frame.$(OTP_SELECTOR);
        if (otpInput) {
          targetPage = frame; // redéfinir pour navigation ultérieure
          break;
        }
      }
    }

    if (!otpInput) {
      logger.warn('[DevStore] OTP input non trouvé, tentative de saisie directe');
      let injected = false;
      for (const frame of rootPage.frames()) {
        injected = await frame.evaluate((c) => {
          const cand = Array.from(document.querySelectorAll('input')).find((el) => {
            const t = el.type || '';
            return ['text','tel','password','number'].includes(t) || (el.name && el.name.toLowerCase().includes('otp'));
          });
          if (cand) {
            cand.value = c;
            cand.dispatchEvent(new Event('input', { bubbles: true }));
            const btn = document.querySelector('button[type="submit"]');
            if (btn) btn.click();
            return true;
          }
          return false;
        }, code);
        if (injected) {
          await frame.waitForNavigation({ waitUntil: 'networkidle0', timeout: 120000 }).catch(()=>{});
          break;
        }
      }

      if (!injected) {
        // fallback rootPage
        await rootPage.keyboard.type(code);
        await rootPage.keyboard.press('Enter');
        await rootPage.waitForNavigation({ waitUntil: 'networkidle0', timeout: 120000 }).catch(()=>{});
      }
    } else {
      await otpInput.click({ clickCount: 3 });
      await otpInput.type(code);
      // Rechercher un bouton sur la page racine (souvent là)
      const submitBtn = await rootPage.$('button[type="submit"], button[data-testid="LoginSubmitButton"], button[name="commit"]');
      if (submitBtn) {
        await Promise.all([
          rootPage.waitForNavigation({ waitUntil: 'networkidle0', timeout: 120000 }),
          submitBtn.click(),
        ]);
      } else {
        await rootPage.keyboard.press('Enter');
        await rootPage.waitForNavigation({ waitUntil: 'networkidle0', timeout: 120000 });
      }
    }

    // Vérifier si nous sommes toujours sur une page two-factor / lookup
    let currentUrl = rootPage.url();
    if (/lookup|two-factor/.test(currentUrl)) {
      logger.info("DevStore: Still on 2FA page after code entry, code was incorrect");
      // Instead of throwing and closing session, return a specific error that keeps session alive
      return {
        error: 'OTP_INCORRECT',
        message: 'OTP incorrect ou expiré',
        sessionStillActive: true
      };
    }

    // After 2FA, direct navigation to admin page
    logger.debug("DevStore: après 2FA, navigation directe vers admin");
    
    // Force navigate to the admin page with no_redirect
    await rootPage.goto('https://admin.shopify.com/?no_redirect=true');
    logger.debug('[DevStore] navigation vers admin après 2FA, URL:', rootPage.url());
    
    await rootPage.waitForSelector('body', { timeout: 20000 });
    await sleep(2000);

    // Look for "Créer une boutique" button
    const createStoreClicked = await rootPage.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('a, button, div[role="button"], [role="link"]'));
      
      for (const element of elements) {
        const text = (element.innerText || element.textContent || '').trim().toLowerCase();
        
        if (text === 'créer une boutique' || text.includes('créer une boutique') ||
            text === 'create store' || text.includes('create store')) {
          logger.debug('[DevStore] Trouvé "Créer une boutique" après 2FA:', text);
          element.click();
          return true;
        }
      }
      return false;
    });

    if (createStoreClicked) {
      try {
        await rootPage.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });
      } catch (err) {
        logger.warn('[DevStore] timeout navigation après 2FA');
      }
    }

    // Check if we're on a signup page (wizard) or store creation form
    currentUrl = rootPage.url();
    
    if (currentUrl.includes('/signup/') || currentUrl.includes('signup_types')) {
      logger.debug("DevStore: Page signup détectée, traitement du wizard");
      
      // Handle signup page - fill store name
      const storeNameFilled = await rootPage.evaluate((storeName) => {
        const nameInputs = Array.from(document.querySelectorAll('input[type="text"], input[name*="name"], input[placeholder*="nom"]'));
        
        for (const input of nameInputs) {
          if (input.offsetParent !== null) { // Check if visible
            input.value = storeName;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            logger.debug('[DevStore] Store name filled:', storeName);
            return true;
          }
        }
        return false;
      }, meta.storeName);
      
      if (storeNameFilled) {
        // Submit signup form
        const signupSubmitted = await rootPage.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
          for (const button of buttons) {
            const text = (button.innerText || button.textContent || button.value || '').toLowerCase();
            
            if (button.type === 'submit' || 
                text.includes('créer') || text.includes('create') ||
                text.includes('submit') || text.includes('continuer') || text.includes('continue')) {
              logger.info("DevStore: Signup form submitted");
              button.click();
              return true;
            }
          }
          return false;
        });
        
        if (signupSubmitted) {
          await rootPage.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 });
        }
      }

      // Handle the setup wizard sequence
      logger.debug("DevStore: gestion du wizard de configuration");
      
      // Wait a bit more for wizard to fully load
      await sleep(3000);
      
      // First, let's debug what's actually on the page
      const pageDebugInfo = await rootPage.evaluate(() => {
        const debugInfo = {
          url: window.location.href,
          title: document.title,
          checkboxes: [],
          radios: [],
          buttons: [],
          allClickableElements: [],
          pageText: document.body.innerText.slice(0, 1000) // First 1000 chars
        };
        
        // Find all checkboxes
        const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
        checkboxes.forEach((cb, idx) => {
          const label = cb.labels?.[0]?.textContent || '';
          const parent = cb.closest('div, label, li')?.textContent?.slice(0, 100) || '';
          debugInfo.checkboxes.push({
            index: idx,
            id: cb.id,
            name: cb.name,
            value: cb.value,
            label: label.slice(0, 100),
            parentText: parent
          });
        });
        
        // Find all radio buttons
        const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
        radios.forEach((radio, idx) => {
          const label = radio.labels?.[0]?.textContent || '';
          const parent = radio.closest('div, label, li')?.textContent?.slice(0, 100) || '';
          debugInfo.radios.push({
            index: idx,
            id: radio.id,
            name: radio.name,
            value: radio.value,
            label: label.slice(0, 100),
            parentText: parent
          });
        });
        
        // Find all buttons
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], div[role="button"]'));
        buttons.forEach((btn, idx) => {
          const text = (btn.innerText || btn.textContent || btn.value || '').slice(0, 100);
          debugInfo.buttons.push({
            index: idx,
            tagName: btn.tagName,
            type: btn.type,
            text: text,
            className: btn.className.slice(0, 100)
          });
        });
        
        // Find all potentially clickable elements with text
        const allClickable = Array.from(document.querySelectorAll('div, span, label, li, section, article'));
        allClickable.forEach((el, idx) => {
          const text = (el.innerText || el.textContent || '').trim();
          if (text.length > 5 && text.length < 200) { // Reasonable text length
            if (text.includes('boutique') || text.includes('ligne') || text.includes('entreprise') || 
                text.includes('petite') || text.includes('plateforme') || text.includes('achète') ||
                text.includes('fabrique') || text.includes('passer') || text.includes('suivant')) {
              debugInfo.allClickableElements.push({
                index: idx,
                tagName: el.tagName,
                text: text.slice(0, 150),
                className: el.className.slice(0, 100),
                hasInput: !!el.querySelector('input'),
                inputType: el.querySelector('input')?.type || 'none'
              });
            }
          }
        });
        
        return debugInfo;
      });
      
      logger.info("DevStore: DEBUG INFO:");
      logger.debug('Page URL:', pageDebugInfo.url);
      logger.debug('Page Title:', pageDebugInfo.title);
      logger.debug('Checkboxes found:', pageDebugInfo.checkboxes.length);
      pageDebugInfo.checkboxes.forEach(cb => {
        logger.debug(`  Checkbox ${cb.index}: ${cb.label || cb.parentText}`);
      });
      logger.debug('Radio buttons found:', pageDebugInfo.radios.length);
      pageDebugInfo.radios.forEach(radio => {
        logger.debug(`  Radio ${radio.index}: ${radio.label || radio.parentText}`);
      });
      logger.debug('Buttons found:', pageDebugInfo.buttons.length);
      pageDebugInfo.buttons.forEach(btn => {
        logger.debug(`  Button ${btn.index}: "${btn.text}"`);
      });
      logger.debug('Relevant clickable elements:', pageDebugInfo.allClickableElements.length);
      pageDebugInfo.allClickableElements.forEach(el => {
        logger.debug(`  ${el.tagName} (hasInput: ${el.hasInput}, inputType: ${el.inputType}): "${el.text}"`);
      });
      logger.debug('Page text preview:', pageDebugInfo.pageText);
      
      // Step 1: "Sur quels canaux souhaitez‑vous vendre ?" - click "Une boutique en ligne"
      logger.debug("DevStore: Étape 1: Recherche "Une boutique en ligne"");
      
      // Try multiple approaches for Step 1
      let boutiqueLigneClicked = false;
      
      // Approach 1: Look for radio buttons or checkboxes with relevant text
      boutiqueLigneClicked = await rootPage.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]'));
        
        for (const input of inputs) {
          const label = input.labels?.[0]?.textContent || '';
          const parent = input.closest('div, label, li, section')?.textContent || '';
          const combined = (label + ' ' + parent).toLowerCase();
          
          if (combined.includes('boutique en ligne') || combined.includes('online store') ||
              combined.includes('boutique') && combined.includes('ligne')) {
            logger.debug('[DevStore] Trouvé input boutique en ligne:', input.type, combined.slice(0, 100));
            input.click();
            return true;
          }
        }
        return false;
      });
      
      if (!boutiqueLigneClicked) {
        // Approach 2: Look for clickable divs/containers with the text
        boutiqueLigneClicked = await rootPage.evaluate(() => {
          const elements = Array.from(document.querySelectorAll('div, li, section, label'));
          
          for (const element of elements) {
            const text = (element.innerText || element.textContent || '').trim();
            
            if (text.includes('Une boutique en ligne') || 
                (text.includes('boutique') && text.includes('ligne')) ||
                text.includes('Créez un site web entièrement personnalisable')) {
              
              logger.debug('[DevStore] Trouvé élément boutique en ligne:', element.tagName, text.slice(0, 100));
              
              // Try to find associated input
              const input = element.querySelector('input') || 
                           element.closest('label')?.querySelector('input') ||
                           element.closest('div')?.querySelector('input');
              
              if (input) {
                logger.debug('[DevStore] Clic sur input associé:', input.type);
                input.click();
              } else {
                logger.info("DevStore: Clic direct sur élément");
                element.click();
              }
              return true;
            }
          }
          return false;
        });
      }
      
      if (!boutiqueLigneClicked) {
        // Approach 3: Just click the first radio button or checkbox (fallback)
        boutiqueLigneClicked = await rootPage.evaluate(() => {
          const firstInput = document.querySelector('input[type="radio"], input[type="checkbox"]');
          if (firstInput) {
            logger.info("DevStore: Fallback: clic sur premier input");
            firstInput.click();
            return true;
          }
          return false;
        });
      }
  
      logger.info("DevStore: Étape 1 résultat:', boutiqueLigneClicked ? 'Succès' : 'Échec");
  
      if (boutiqueLigneClicked) {
        await sleep(1000);
        
        // Click "Suivant" to go to step 2
        logger.debug("DevStore: Recherche bouton "Suivant" étape 1");
        const suivantClicked1 = await rootPage.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], div[role="button"]'));
          
          for (const button of buttons) {
            const text = (button.innerText || button.textContent || button.value || '').trim().toLowerCase();
            
            if (text === 'suivant' || text === 'next') {
              logger.info("DevStore: Clic "Suivant" étape 1");
              button.click();
              return true;
            }
          }
          return false;
        });
        
        if (suivantClicked1) {
          logger.debug("DevStore: Navigation vers étape 2");
          await sleep(2000); // Wait for slide transition
          
          // Now handle all remaining steps sequentially
          const wizardResult = await handleAllWizardSteps(rootPage, meta.nomProjet);
          
          // Check if the wizard completed successfully with shop validation
          if (wizardResult && wizardResult.shopValidated) {
            logger.info("DevStore: 🎉 Processus terminé via wizard avec validation automatique!");
            deleteSession(sessionId);
            global.currentShopValidation = null;
            return { 
              domain: wizardResult.domain, 
              adminUrl: wizardResult.adminUrl, 
              storeName: meta.storeName, 
              meta 
            };
          }
        }
      } else {
        logger.warn('[DevStore] Étape 1 échouée - impossible de trouver "Une boutique en ligne"');
      }
      
      // Wait for final navigation after wizard completion
      await rootPage.waitForNavigation({ waitUntil: 'networkidle0', timeout: 300000 });
      
    } else {
      // Original logic for direct store creation form
      logger.debug("DevStore: Page creation directe détectée");
      
      // Wait for store creation form
      await rootPage.waitForSelector([
        'input[name="development_store[name]"]',
        'input[placeholder*="nom"]', 
        'input[placeholder*="name"]',
        'input[type="text"]'
      ].join(', '), { timeout: 4000 });

      // Input store name using evaluate for better reliability
      const nameInputted = await rootPage.evaluate((storeName) => {
        const selectors = [
          'input[name="development_store[name]"]',
          'input[placeholder*="nom"]',
          'input[placeholder*="name"]',
          'input[type="text"]'
        ];
        
        for (const selector of selectors) {
          const input = document.querySelector(selector);
          if (input && input.offsetParent !== null) {
            input.value = storeName;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
        return false;
      }, meta.storeName);

      if (!nameInputted) {
        throw new Error('Store name input not found after 2FA');
      }

      // Submit form
      const submitted = await rootPage.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
        for (const button of buttons) {
          const text = (button.innerText || button.textContent || button.value || '').toLowerCase();
          const type = button.type || '';
          
          if (type === 'submit' ||
              text.includes('créer') || text.includes('create') ||
              text.includes('submit') || text.includes('envoyer')) {
            button.click();
            return true;
          }
        }
        return false;
      });

      if (!submitted) {
        throw new Error('Impossible de soumettre le formulaire après 2FA');
      }
      await rootPage.waitForNavigation({ waitUntil: 'networkidle0', timeout: 300000 });
    }

    const adminUrl = rootPage.url();
    const match = adminUrl.match(/^https:\/\/(.*?)\/admin/);
    if (!match) throw new Error('cannot detect domain after 2FA');
    const domain = match[1];

    await rootPage.browser().close();
    deleteSession(sessionId);
    
    // Clean up global validation data
    global.currentShopValidation = null;

    return { domain, adminUrl, storeName: meta.storeName, meta };
  } catch (err) {
    // Check if this is our success signal
    if (err.message === 'SHOP_CREATED_SUCCESSFULLY') {
      logger.info("DevStore: 🎉 Processus terminé avec succès et validation automatique!");
      deleteSession(sessionId);
      global.currentShopValidation = null;
      
      // Return success result instead of throwing error
      return { 
        domain: 'auto-validated', 
        adminUrl: 'https://admin.shopify.com', 
        storeName: meta.storeName, 
        meta,
        success: true
      };
    }
    
    // For real errors, clean up and throw
    if (rootPage && rootPage.browser && rootPage.browser().isConnected) {
      await rootPage.browser().close();
    }
    deleteSession(sessionId);
    
    // Clean up global validation data
    global.currentShopValidation = null;
    
    throw err;
  }
}



async function updateShopNameInSettings(page, storeName) {
  try {
    logger.debug("DevStore: Navigation vers les paramètres");
    logger.debug('[DevStore] URL courante:', page.url());
    
    // Log and normalize the project name to ensure it is a string
    const projectName = String(storeName || '');
    logger.debug('[DevStore] Nom du projet pour mise à jour:', projectName);
    if (!projectName) {
      logger.warn('[DevStore] ⚠️ Le nom du projet est vide ou indéfini.');
    }
    
    // Wait for admin page to fully load
    await sleep(2000);
    
    // Look for "Paramètres" in the left sidebar with better targeting
    const parametresClicked = await page.evaluate(() => {
      logger.debug("DevStore: Recherche "Paramètres" dans la sidebar");
      
      // First, try to find sidebar navigation
      const sidebarElements = Array.from(document.querySelectorAll('nav a, nav button, [data-testid*="sidebar"] a, [data-testid*="navigation"] a, aside a, .sidebar a'));
      
      for (const element of sidebarElements) {
        const text = (element.innerText || element.textContent || '').trim();
        
        if (text === 'Paramètres' || text === 'Settings') {
          logger.info("DevStore: Trouvé "Paramètres" dans sidebar");
          element.click();
          return true;
        }
      }
      
      // Fallback: look in all elements
      const allElements = Array.from(document.querySelectorAll('a, button, div, span'));
      
      for (const element of allElements) {
        const text = (element.innerText || element.textContent || '').trim();
        
        if (text === 'Paramètres' || text === 'Settings') {
          logger.info("DevStore: Trouvé "Paramètres" (fallback)");
          element.click();
          return true;
        }
      }
      
      // Last resort: look for elements containing "paramètre" or "setting"
      for (const element of allElements) {
        const text = (element.innerText || element.textContent || '').trim().toLowerCase();
        
        if (text.includes('paramètre') || text.includes('setting')) {
          logger.info("DevStore: Trouvé élément paramètres (partial match)");
          element.click();
          return true;
        }
      }
      
      logger.info("DevStore: Aucun élément "Paramètres" trouvé");
      return false;
    });
    
    if (parametresClicked) {
      logger.info("DevStore: Navigation vers paramètres réussie");
      await sleep(2000); // Wait for settings page to load
      
      // Look for "Détails de la boutique" section and the pencil icon
      logger.debug("DevStore: Recherche section "Détails de la boutique" et icône crayon");
      
      // First, try hovering over elements that might contain shop details
      try {
        logger.debug("DevStore: Tentative hover sur éléments potentiels");
        
        // Try to hover over elements containing shop details
        const shopDetailElements = await page.$$eval('div', (divs) => {
          const results = [];
          divs.forEach((div, index) => {
            const text = (div.innerText || div.textContent || '').trim();
            if ((text.includes('@') || text.includes('Aucun numéro de téléphone')) && 
                text.length > 20 && text.length < 500) {
              results.push(index);
            }
          });
          return results;
        });
        
        logger.debug('[DevStore] Éléments avec détails boutique trouvés:', shopDetailElements.length);
        
        for (const elementIndex of shopDetailElements.slice(0, 3)) {
          try {
            logger.debug(`[DevStore] Hover sur élément ${elementIndex}...`);
            
            const element = await page.evaluateHandle((index) => {
              const divs = Array.from(document.querySelectorAll('div'));
              return divs[index];
            }, elementIndex);
            
            await element.hover();
            await sleep(1000); // Wait for hover effect
            
            logger.debug("DevStore: Recherche icône crayon après hover");
            // Now look for edit icons that appeared
            const editIcons = await page.$$eval('button, svg', (elements) => {
              return elements.filter(el => {
                const className = (el.className || '').toString();
                const ariaLabel = el.getAttribute('aria-label') || '';
                const rect = el.getBoundingClientRect();
                
                return rect.width > 0 && rect.height > 0 && (
                  className.includes('edit') ||
                  className.includes('pencil') ||
                  className.includes('icon') ||
                  ariaLabel.includes('edit') ||
                  ariaLabel.includes('modifier')
                );
              }).length;
            });
            
            logger.debug(`[DevStore] Icônes edit trouvées après hover: ${editIcons}`);
            
            if (editIcons > 0) {
              logger.debug("DevStore: Tentative clic sur icône edit");
              const clicked = await page.evaluate(() => {
                const editElements = Array.from(document.querySelectorAll('button, svg')).filter(el => {
                  const className = (el.className || '').toString();
                  const ariaLabel = el.getAttribute('aria-label') || '';
                  const rect = el.getBoundingClientRect();
                  
                  return rect.width > 0 && rect.height > 0 && (
                    className.includes('edit') ||
                    className.includes('pencil') ||
                    className.includes('icon') ||
                    ariaLabel.includes('edit') ||
                    ariaLabel.includes('modifier')
                  );
                });
                
                for (const el of editElements) {
                  try {
                    el.click();
                    logger.info("DevStore: Clic sur icône edit réussi!");
                    return true;
                  } catch (e) {
                    logger.debug('[DevStore] Erreur clic:', e.message);
                  }
                }
                return false;
              });
              
              if (clicked) {
                logger.info("DevStore: Icône edit cliquée avec succès!");
                break;
              }
            }
          } catch (e) {
            logger.debug(`[DevStore] Erreur hover élément ${elementIndex}:`, e.message);
          }
        }
      } catch (e) {
        logger.debug('[DevStore] Erreur lors du hover:', e.message);
      }
      
      // Fallback: try to find and click any edit button on the page
      const editClicked = await page.evaluate(() => {
        logger.info("DevStore: === RECHERCHE DÉTAILS DE LA BOUTIQUE ===");
        logger.debug('[DevStore] Page URL:', window.location.href);
        logger.debug('[DevStore] Page title:', document.title);
        
        // Debug: Show page content preview
        const pageText = document.body.innerText || '';
        logger.debug('[DevStore] Page content preview:', pageText.substring(0, 800));
        
        // First, find the "Détails de la boutique" section
        const allElements = Array.from(document.querySelectorAll('*'));
        let detailsBoutiqueSection = null;
        
        for (const element of allElements) {
          const text = (element.innerText || element.textContent || '').trim();
          
          if (text.includes('Détails de la boutique') || text.includes('Store details')) {
            logger.info("DevStore: Trouvé section "Détails de la boutique"");
            detailsBoutiqueSection = element;
            break;
          }
        }
        
        if (!detailsBoutiqueSection) {
          logger.debug("DevStore: Section "Détails de la boutique" non trouvée, recherche alternative");
          
          // Alternative: look for elements containing shop name, email, phone patterns
          for (const element of allElements) {
            const text = (element.innerText || element.textContent || '').trim();
            
            // Look for elements containing "Aucun numéro de téléphone" or email patterns
            if (text.includes('Aucun numéro de téléphone') || 
                text.includes('No phone number') ||
                text.includes('@') && text.includes('.')) {
              logger.debug('[DevStore] Trouvé élément avec téléphone/email:', text.substring(0, 100));
              detailsBoutiqueSection = element.closest('div, section');
              break;
            }
          }
        }
        
        if (detailsBoutiqueSection) {
          logger.debug("DevStore: Section détails trouvée, recherche du div supérieur avec icône boutique");
          
          // Look for the upper div with shop icon (contains name, email, phone)
          const childDivs = Array.from(detailsBoutiqueSection.querySelectorAll('div'));
          
          for (const div of childDivs) {
            const divText = (div.innerText || div.textContent || '').trim();
            
                         // Check if this div contains shop details (name, email, phone/Aucun numéro)
             if ((divText.includes('@') || divText.includes('Aucun numéro de téléphone')) && 
                 divText.length > 20 && divText.length < 500) {
               
               logger.debug('[DevStore] Trouvé div avec détails boutique:', divText.substring(0, 150));
               
               // IMPORTANT: Hover over the div first to make the pencil icon appear
               logger.debug("DevStore: Hover sur le div pour faire apparaître l\'icône crayon");
               div.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
               div.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
               
               // Wait a bit for the hover effect to take place (synchronous wait)
               const start = Date.now();
               while (Date.now() - start < 500) {
                 // Synchronous wait
               }
               
               // Now look for pencil icon on the right side of this div
               const pencilElements = Array.from(div.querySelectorAll('*')).filter(el => {
                 const tagName = el.tagName.toLowerCase();
                 const className = (el.className || '').toString();
                 const innerHTML = el.innerHTML || '';
                 const ariaLabel = el.getAttribute('aria-label') || '';
                 
                 // Look for SVG icons, buttons, or elements that could be pencil icons
                 return tagName === 'svg' || 
                        tagName === 'button' ||
                        className.includes('edit') ||
                        className.includes('pencil') ||
                        className.includes('icon') ||
                        innerHTML.includes('pencil') ||
                        innerHTML.includes('edit') ||
                        ariaLabel.includes('edit') ||
                        ariaLabel.includes('modifier');
               });
               
               logger.debug('[DevStore] Icônes crayon trouvées après hover:', pencilElements.length);
               
               for (let i = 0; i < pencilElements.length; i++) {
                 const pencil = pencilElements[i];
                 logger.debug(`[DevStore] Crayon ${i}:`, pencil.tagName, pencil.className, pencil.getAttribute('aria-label'));
                 
                 try {
                   // Get the position to check if it's on the right side
                   const divRect = div.getBoundingClientRect();
                   const pencilRect = pencil.getBoundingClientRect();
                   
                   // Check if pencil is on the right side of the div
                   if (pencilRect.left > divRect.left + (divRect.width * 0.7)) {
                     logger.debug("DevStore: Crayon trouvé sur le côté droit, tentative de clic");
                     pencil.click();
                     logger.info("DevStore: Clic sur icône crayon réussi!");
                     return true;
                   }
                 } catch (e) {
                   logger.debug('[DevStore] Erreur lors du clic sur crayon', i, ':', e.message);
                 }
               }
               
               // Fallback: try clicking any pencil/edit element in this div
               if (pencilElements.length > 0) {
                 try {
                   logger.debug("DevStore: Tentative de clic sur premier élément crayon");
                   pencilElements[0].click();
                   logger.info("DevStore: Clic fallback réussi!");
                   return true;
                 } catch (e) {
                   logger.debug('[DevStore] Erreur clic fallback:', e.message);
                 }
               }
               
               // If no pencil found, try hovering over potential parent containers
               logger.debug("DevStore: Aucun crayon trouvé, tentative hover sur conteneurs parents");
               const parentContainers = [div.parentElement, div.closest('section'), div.closest('article'), div.closest('[class*="card"]')];
               
               for (const container of parentContainers) {
                 if (container) {
                   logger.debug("DevStore: Hover sur conteneur parent");
                                       container.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                    container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                    
                    // Synchronous wait
                    const start2 = Date.now();
                    while (Date.now() - start2 < 300) {
                      // Synchronous wait
                    }
                   
                   // Look for pencil icons that appeared
                   const newPencils = Array.from(container.querySelectorAll('svg, button, [class*="edit"], [class*="pencil"], [class*="icon"]'));
                   for (const pencil of newPencils) {
                     try {
                       if (pencil.getBoundingClientRect().width > 0) { // Check if visible
                         logger.debug("DevStore: Tentative clic sur nouveau crayon après hover parent");
                         pencil.click();
                         logger.info("DevStore: Clic sur crayon parent réussi!");
                         return true;
                       }
                     } catch (e) {
                       logger.debug('[DevStore] Erreur clic crayon parent:', e.message);
                     }
                   }
                 }
               }
             }
          }
          
          // Final fallback: look for any pencil/edit icons in the entire section
          logger.debug("DevStore: Recherche fallback de toute icône crayon dans la section");
          const allPencils = Array.from(detailsBoutiqueSection.querySelectorAll('svg, button, [class*="edit"], [class*="pencil"], [class*="icon"]'));
          
          for (const pencil of allPencils) {
            try {
              logger.debug('[DevStore] Tentative clic crayon fallback:', pencil.tagName, pencil.className);
              pencil.click();
              logger.info("DevStore: Clic crayon fallback réussi!");
              return true;
            } catch (e) {
              logger.debug('[DevStore] Erreur clic crayon fallback:', e.message);
            }
                     }
         }
         
         // Ultimate fallback: since we're on settings page, look for ANY edit icons
         logger.debug("DevStore: Recherche ultime fallback: tous les éléments éditables sur la page");
         const allEditElements = Array.from(document.querySelectorAll('button, svg, [role="button"], [class*="edit"], [class*="icon"], [aria-label*="edit"], [aria-label*="modifier"]'));
         logger.debug('[DevStore] Éléments éditables trouvés sur toute la page:', allEditElements.length);
         
         for (let i = 0; i < Math.min(allEditElements.length, 10); i++) {
           const el = allEditElements[i];
           const tagName = el.tagName.toLowerCase();
           const className = (el.className || '').toString();
           const ariaLabel = el.getAttribute('aria-label') || '';
           const text = (el.innerText || el.textContent || '').trim();
           
           logger.debug("DevStore operation");,
             ariaLabel,
             text: text.substring(0, 30)
           });
           
           // Try clicking if it looks like an edit button
           if ((tagName === 'button' || tagName === 'svg') && 
               (className.includes('edit') || ariaLabel.includes('edit') || ariaLabel.includes('modifier'))) {
             try {
               logger.debug(`[DevStore] Tentative clic sur élément ${i}...`);
               el.click();
               logger.debug(`[DevStore] Clic réussi sur élément ${i}!`);
               return true;
             } catch (e) {
               logger.debug(`[DevStore] Erreur clic élément ${i}:`, e.message);
             }
           }
         }
         
         logger.info("DevStore: Aucune icône crayon cliquable trouvée");
         return false;
      });
      
      if (editClicked) {
        logger.info("DevStore: Icône modifier cliquée");
        await sleep(1500); // Wait for edit form to appear
        
        // Clear and update the shop name field in the "Modifier le profil" dialog
        logger.debug("DevStore: Mise à jour du champ "Nom de la boutique"");
        
        // Wait longer for modal to fully load
        await sleep(2000);
        
        // Try Puppeteer typing approach first (like email/password)
        let nameUpdated = false;
        
        logger.debug("DevStore: Essai méthode Puppeteer typing");
        
        try {
          // Wait for modal to be ready
          await sleep(1000);
          
          // Method 1: Find input with "Ma boutique" value using Puppeteer
          const shopNameInputs = await page.$$eval('input[type="text"], textarea', inputs => {
            return inputs.map((input, index) => ({
              index,
              value: input.value,
              placeholder: input.placeholder,
              name: input.name,
              id: input.id
            }));
          });
          
          logger.debug('[DevStore] Inputs analysés:', shopNameInputs);
          
          // Find the one with "Ma boutique"
          const maBoutiqueIndex = shopNameInputs.findIndex(input => input.value === 'Ma boutique');
          
          if (maBoutiqueIndex !== -1) {
            logger.debug('[DevStore] ✅ Champ "Ma boutique" trouvé à l\'index:', maBoutiqueIndex);
            
            // Get all inputs and select the right one
            const inputs = await page.$$('input[type="text"], textarea');
            const targetInput = inputs[maBoutiqueIndex];
            
                         if (targetInput) {
               // Focus on the input
               await targetInput.focus();
               
               // Select all text (triple click to select "Ma boutique")
               await targetInput.click({ clickCount: 3 });
               
               // Clear the field and immediately type without losing focus
               await page.keyboard.press('Backspace');
               
               // Immediately type the new name while still focused
               await page.keyboard.type(projectName, { delay: 50 });
               
               // Blur the field to ensure Shopify enables the save button
               await page.keyboard.press('Tab');
               
               logger.info("DevStore: ✅ Nom saisi avec Puppeteer typing");
               nameUpdated = true;
             }
          } else {
            logger.debug("DevStore: Champ "Ma boutique" non trouvé, essai première input");
            
                         // Try the first visible text input
             const inputs = await page.$$('input[type="text"], textarea');
             if (inputs.length > 0) {
               const firstInput = inputs[0];
               await firstInput.focus();
               await firstInput.click({ clickCount: 3 });
               
               // Clear and immediately type without losing focus
               await page.keyboard.press('Backspace');
               await page.keyboard.type(projectName, { delay: 50 });
               
               // Blur the field to ensure Shopify enables the save button
               await page.keyboard.press('Tab');
               
               logger.info("DevStore: ✅ Nom saisi dans la première input disponible");
               nameUpdated = true;
             }
          }
        } catch (error) {
          logger.debug('[DevStore] Erreur Puppeteer typing:', error.message);
        }
        
        // Fallback to page.evaluate if Puppeteer typing failed
        if (!nameUpdated) {
          logger.debug("DevStore: Fallback vers page.evaluate");
          nameUpdated = await page.evaluate((newStoreName) => {
          logger.info("DevStore: === MODAL "MODIFIER LE PROFIL" DEBUG ===");
          logger.debug("DevStore: Recherche du modal "Modifier le profil"");
          logger.debug('[DevStore] Nom à insérer:', newStoreName);
          const projectName = newStoreName; // alias for consistency with outer scope variable name changes
          logger.debug('[DevStore] Page URL:', window.location.href);
          logger.debug('[DevStore] Page title:', document.title);
          
          // Look for the "Modifier le profil" modal specifically
          logger.debug("DevStore: Recherche du modal "Modifier le profil"");
          
          let modalElement = null;
          
          // First, look for any element containing "Modifier le profil" text
          const modifierElements = Array.from(document.querySelectorAll('*')).filter(el => {
            const text = (el.textContent || '').trim();
            return text.includes('Modifier le profil');
          });
          
          logger.debug('[DevStore] Éléments contenant "Modifier le profil":', modifierElements.length);
          
          // Find the modal container for "Modifier le profil"
          for (const element of modifierElements) {
            logger.debug('[DevStore] Trouvé "Modifier le profil":', element.textContent.substring(0, 100));
            
            // Look for the modal container (parent elements that might be the modal)
            let currentElement = element;
            for (let i = 0; i < 10; i++) { // Check up to 10 parent levels
              currentElement = currentElement.parentElement;
              if (!currentElement) break;
              
              const rect = currentElement.getBoundingClientRect();
              const style = window.getComputedStyle(currentElement);
              const hasInputs = currentElement.querySelectorAll('input, textarea').length > 0;
              
              if (rect.width > 300 && rect.height > 200 && hasInputs &&
                  (style.position === 'fixed' || style.position === 'absolute' || 
                   parseInt(style.zIndex) > 10 || 
                   style.backgroundColor !== 'rgba(0, 0, 0, 0)')) {
                logger.debug('[DevStore] Trouvé modal "Modifier le profil":', currentElement);
                modalElement = currentElement;
                break;
              }
            }
            if (modalElement) break;
          }
          
          // Fallback: Look for any modal with "Ma boutique" input
          if (!modalElement) {
            logger.debug("DevStore: Fallback: recherche modal avec input "Ma boutique"");
            const allInputs = Array.from(document.querySelectorAll('input[type="text"], textarea'));
            
            for (const input of allInputs) {
              if (input.value === 'Ma boutique') {
                logger.debug('[DevStore] Trouvé input "Ma boutique":', input);
                
                // Find the modal container for this input
                let currentElement = input;
                for (let i = 0; i < 10; i++) {
                  currentElement = currentElement.parentElement;
                  if (!currentElement) break;
                  
                  const rect = currentElement.getBoundingClientRect();
                  const style = window.getComputedStyle(currentElement);
                  
                  if (rect.width > 300 && rect.height > 200 &&
                      (style.position === 'fixed' || style.position === 'absolute' || 
                       parseInt(style.zIndex) > 10)) {
                    logger.debug('[DevStore] Trouvé modal contenant "Ma boutique":', currentElement);
                    modalElement = currentElement;
                    break;
                  }
                }
                if (modalElement) break;
              }
            }
          }
          
          if (modalElement) {
            logger.debug("DevStore: Modal trouvé! Recherche du champ dans le modal");
            
            // Look for input fields specifically inside the modal
            const modalInputs = Array.from(modalElement.querySelectorAll('input, textarea, select'));
            logger.debug('[DevStore] Champs dans le modal:', modalInputs.length);
          } else {
            logger.debug("DevStore: Aucun modal trouvé, recherche dans toute la page");
            
            // Fallback: look in the entire page
          const allInputs = Array.from(document.querySelectorAll('input, textarea, select'));
          logger.debug('[DevStore] TOUS les champs input trouvés:', allInputs.length);
            
            modalInputs = allInputs;
          }
          
          const allInputs = modalElement ? 
            Array.from(modalElement.querySelectorAll('input, textarea, select')) : 
            Array.from(document.querySelectorAll('input, textarea, select'));
          
          logger.debug('[DevStore] Champs à analyser:', allInputs.length);
          
          // Debug: show ALL inputs found
          allInputs.forEach((inp, idx) => {
            const rect = inp.getBoundingClientRect();
            logger.debug("DevStore operation");
          });
          
          // Also check for any labels within the modal
          const labelScope = modalElement || document;
          const labels = Array.from(labelScope.querySelectorAll('label'));
          logger.debug('[DevStore] Labels trouvés dans le scope:', labels.length);
          labels.forEach((label, idx) => {
            const text = label.textContent || '';
            if (text.toLowerCase().includes('nom') || text.toLowerCase().includes('boutique') || text.toLowerCase().includes('store')) {
              logger.debug(`[DevStore] Label ${idx} pertinent:`, text);
            }
          });
          
          // Look for text containing "nom" or "boutique" within the modal
          const textScope = modalElement || document;
          const textElements = Array.from(textScope.querySelectorAll('*')).filter(el => {
            const text = (el.innerText || '').trim().toLowerCase();
            return text.includes('nom') && text.length < 100;
          });
          logger.debug('[DevStore] Éléments contenant "nom" dans le scope:', textElements.length);
          textElements.slice(0, 5).forEach((el, idx) => {
            logger.debug(`[DevStore] Text ${idx}:`, (el.innerText || '').trim());
          });
          
          // Look specifically for the "Ma boutique" input field
          logger.debug("DevStore: Recherche spécifique du champ "Ma boutique"");
          
          // First, try to find input with value "Ma boutique" directly
          const maBoutiqueInputs = allInputs.filter(inp => {
            const rect = inp.getBoundingClientRect();
            return inp.value === 'Ma boutique' && rect.width > 0 && rect.height > 0;
          });
          
          logger.debug('[DevStore] Champs "Ma boutique" trouvés:', maBoutiqueInputs.length);
          
          if (maBoutiqueInputs.length > 0) {
            const targetInput = maBoutiqueInputs[0];
            console.log('[DevStore] Champ "Ma boutique" trouvé:', {
              value: targetInput.value,
              name: targetInput.name,
              id: targetInput.id,
              placeholder: targetInput.placeholder
            });
            
            try {
              logger.debug("DevStore: Mise à jour du champ "Ma boutique"");
              
              // Step 1: Focus on the field
              targetInput.focus();
              
              // Step 2: Select all text
              targetInput.select();
              targetInput.setSelectionRange(0, targetInput.value.length);
              
              // Step 3: Clear the field using multiple methods
              targetInput.value = '';
              
              // Step 4: Wait a moment for the field to register as empty
              const waitTime = 200;
              const start = Date.now();
              while (Date.now() - start < waitTime) {
                // Synchronous wait
              }
              
              // Step 5: Set the new value using React-compatible method
              const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
              nativeInputValueSetter.call(targetInput, projectName);
              
              // Step 6: Also set it directly
              targetInput.value = projectName;
              
              // Step 7: Trigger input events to simulate typing
              targetInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
              targetInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
              
              // Step 8: Simulate keyboard events for each character
              for (let i = 0; i < projectName.length; i++) {
                const char = projectName[i];
                targetInput.dispatchEvent(new KeyboardEvent('keydown', { 
                  key: char, 
                  bubbles: true, 
                  cancelable: true 
                }));
                targetInput.dispatchEvent(new KeyboardEvent('keypress', { 
                  key: char, 
                  bubbles: true, 
                  cancelable: true 
                }));
                targetInput.dispatchEvent(new KeyboardEvent('keyup', { 
                  key: char, 
                  bubbles: true, 
                  cancelable: true 
                }));
              }
              
              // Step 9: Final events
              targetInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
              targetInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
              
              // Step 10: Verify the value was set
              logger.debug('[DevStore] Valeur finale dans le champ:', targetInput.value);
              logger.debug('[DevStore] Valeur attendue:', projectName);
              logger.debug('[DevStore] Valeurs identiques?', targetInput.value === projectName);
              
              if (targetInput.value === projectName) {
                logger.info("DevStore: ✅ Champ "Ma boutique" mis à jour avec succès!");
                return true;
              } else {
                logger.debug("DevStore: ❌ Première tentative échouée, essai avec execCommand");
                
                // Alternative approach: use execCommand for stubborn React forms
                targetInput.focus();
                targetInput.select();
                
                // Clear using execCommand
                document.execCommand('selectAll');
                document.execCommand('delete');
                
                // Wait a moment
                const start2 = Date.now();
                while (Date.now() - start2 < 200) {
                  // Synchronous wait
                }
                
                // Insert text using execCommand
                document.execCommand('insertText', false, projectName);
                
                // Trigger events after execCommand
                targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                targetInput.dispatchEvent(new Event('change', { bubbles: true }));
                
                logger.debug('[DevStore] Valeur après execCommand:', targetInput.value);
                
                if (targetInput.value === projectName) {
                  logger.info("DevStore: ✅ Mise à jour réussie avec execCommand!");
                  return true;
                } else {
                  logger.debug("DevStore: ❌ execCommand échoué aussi, tentative de typing simulation");
                  
                  // Final attempt: Simulate real typing character by character
                  targetInput.focus();
                  targetInput.select();
                  targetInput.value = '';
                  
                  // Type each character individually
                  for (let i = 0; i < projectName.length; i++) {
                    const char = projectName[i];
                    
                    // Append character
                    targetInput.value += char;
                    
                    // Update React state
                    nativeInputValueSetter.call(targetInput, targetInput.value);
                    
                    // Trigger events for this character
                    targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                  
                  // Final change event
                  targetInput.dispatchEvent(new Event('change', { bubbles: true }));
                  
                  logger.debug('[DevStore] Valeur après typing simulation:', targetInput.value);
                  
                  if (targetInput.value === projectName) {
                    logger.info("DevStore: ✅ Mise à jour réussie avec typing simulation!");
                    return true;
                  }
                }
              }
            } catch (e) {
              logger.debug('[DevStore] Erreur lors de la mise à jour du champ "Ma boutique":', e.message);
            }
          }
          
          // If we have a modal and no "Ma boutique" inputs, show modal content for debugging
          if (modalElement && maBoutiqueInputs.length === 0) {
            logger.info("DevStore: Modal trouvé mais aucun input "Ma boutique". Contenu du modal:");
            logger.debug('[DevStore] Modal innerHTML (first 500 chars):', modalElement.innerHTML.substring(0, 500));
            logger.debug('[DevStore] Modal textContent:', modalElement.textContent.substring(0, 300));
          }
          
          // Filter all visible text inputs for fallback
          const nameInputs = allInputs.filter(inp => {
            const rect = inp.getBoundingClientRect();
            return (inp.type === 'text' || inp.tagName === 'TEXTAREA') && rect.width > 0 && rect.height > 0;
          });
          logger.debug('[DevStore] Tous les champs text visibles:', nameInputs.length);
          
          for (let i = 0; i < nameInputs.length; i++) {
            const input = nameInputs[i];
            const label = input.labels?.[0]?.textContent || '';
            const placeholder = input.placeholder || '';
            const name = input.name || '';
            const value = input.value || '';
            const id = input.id || '';
            
            // Look for closest label or text near the input
            const parentContainer = input.closest('div, fieldset, form');
            const nearbyText = parentContainer?.textContent || '';
            
            logger.debug("DevStore operation");
            });
            
            // Check if this is the shop name field - more flexible matching
            const isShopNameField = 
              label.includes('Nom de la boutique') || label.includes('Store name') ||
                placeholder.includes('Nom de la boutique') || placeholder.includes('Store name') ||
                nearbyText.includes('Nom de la boutique') || nearbyText.includes('Store name') ||
                name.includes('store_name') || name.includes('shop_name') ||
                id.includes('store_name') || id.includes('shop_name') ||
              (value === 'Ma boutique' || value.includes('boutique')) && input.type === 'text' ||
              // Also check if it's the first text input after the edit was clicked
              (i === 0 && input.type === 'text');
              
            if (isShopNameField) {
              
              logger.debug('[DevStore] Trouvé champ "Nom de la boutique" (index:', i, '):', input);
              
              try {
                console.log('[DevStore] Tentative mise à jour du champ:', {
                  currentValue: input.value,
                  newValue: projectName,
                  inputType: input.type,
                  inputName: input.name,
                  inputId: input.id,
                  isFirstTextInput: i === 0
                });
                
                // Step 1: Focus on the field and wait a bit
                input.focus();
                
                // Step 2: Select all text and clear it completely
                input.select();
                input.setSelectionRange(0, input.value.length);
                
                // Step 3: Clear the field using multiple methods
                input.value = '';
                
                // Use React-style clearing
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                nativeInputValueSetter.call(input, '');
                
                // Trigger events after clearing
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                
                logger.debug('[DevStore] Champ vidé. Valeur après clearing:', input.value);
                
                // Step 4: Set the new value using multiple approaches
                nativeInputValueSetter.call(input, projectName);
                input.value = projectName;
                
                // Step 5: Trigger events to notify the form
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.dispatchEvent(new Event('keyup', { bubbles: true }));
                
                // Step 6: Simulate real typing for React apps
                for (let char of projectName) {
                  input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
                  input.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
                  input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
                }
                
                logger.debug('[DevStore] Valeur finale après mise à jour:', input.value);
                
                if (input.value === projectName) {
                  logger.debug('[DevStore] Nom de la boutique mis à jour avec succès:', projectName);
                  return true;
                } else {
                  logger.debug("DevStore: La valeur n\'a pas été mise à jour correctement, tentative avec execCommand");
                  
                  // Fallback: Try with execCommand
                  input.focus();
                  input.select();
                  document.execCommand('delete');
                  document.execCommand('insertText', false, projectName);
                  
                  logger.debug('[DevStore] Valeur après execCommand:', input.value);
                  
                  if (input.value === projectName) {
                    logger.info("DevStore: Mise à jour réussie avec execCommand");
                    return true;
                  }
                }
                
                return false;
              } catch (e) {
                logger.debug('[DevStore] Erreur lors de la mise à jour:', e.message);
                return false;
              }
            }
          }
          
          // Fallback 1: Look for any input that currently contains "boutique" anywhere in its value
          logger.debug("DevStore: Fallback 1: recherche champ contenant "boutique"");
          for (let i = 0; i < nameInputs.length; i++) {
            const input = nameInputs[i];
            if (input.value && input.value.toLowerCase().includes('boutique')) {
              logger.debug('[DevStore] Trouvé champ avec "boutique":', input.value);
              
              try {
                logger.debug("DevStore: Tentative mise à jour fallback 1");
                input.focus();
                input.select();
                
                // Clear completely
                input.value = '';
                
                // Wait a moment
                const start = Date.now();
                while (Date.now() - start < 200) {
                  // Synchronous wait
                }
                
                // React-style update
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                nativeInputValueSetter.call(input, projectName);
                input.value = projectName;
                
                // Trigger comprehensive events
                input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                
                // Character-by-character keyboard simulation
                for (let i = 0; i < projectName.length; i++) {
                  const char = projectName[i];
                  input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
                  input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
                }
                
                logger.debug('[DevStore] Fallback 1 - Valeur après mise à jour:', input.value);
                
                if (input.value === projectName) {
                  logger.info("DevStore: ✅ Fallback 1 réussi!");
                  return true;
                } else {
                  // Try execCommand for this fallback too
                  input.focus();
                  input.select();
                  document.execCommand('selectAll');
                  document.execCommand('delete');
                  document.execCommand('insertText', false, projectName);
                  
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                
                  logger.debug('[DevStore] Fallback 1 execCommand - Valeur:', input.value);
                
                if (input.value === projectName) {
                    logger.info("DevStore: ✅ Fallback 1 réussi avec execCommand!");
                  return true;
                  }
                }
              } catch (e) {
                logger.debug('[DevStore] Erreur fallback 1:', e.message);
              }
            }
          }
          
          // Fallback 2: Try the first text input in the modal/scope (as mentioned by user)
          logger.debug("DevStore: Fallback 2: utilisation du premier champ text dans le modal");
          if (nameInputs.length > 0) {
            const firstInput = nameInputs[0];
            console.log('[DevStore] Premier champ text trouvé:', {
              value: firstInput.value,
              placeholder: firstInput.placeholder,
              name: firstInput.name,
              id: firstInput.id
            });
            
            try {
              logger.debug("DevStore: Tentative mise à jour fallback 2 (premier champ)");
              firstInput.focus();
              firstInput.select();
              
              // Clear and wait
              firstInput.value = '';
              const start = Date.now();
              while (Date.now() - start < 200) {
                // Synchronous wait
              }
              
              // Set value with multiple methods
              const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
              nativeInputValueSetter.call(firstInput, projectName);
              firstInput.value = projectName;
              
              // Comprehensive event triggering
              firstInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
              firstInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
              
              // Keyboard simulation
              for (let i = 0; i < projectName.length; i++) {
                const char = projectName[i];
                firstInput.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
                firstInput.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
              }
              
              logger.debug('[DevStore] Fallback 2 - Valeur après mise à jour:', firstInput.value);
              
              if (firstInput.value === projectName) {
                logger.info("DevStore: Fallback 2 réussi!");
                return true;
              } else {
                // Try execCommand
                firstInput.focus();
                firstInput.select();
                document.execCommand('selectAll');
                document.execCommand('delete');
                document.execCommand('insertText', false, projectName);
                
                firstInput.dispatchEvent(new Event('input', { bubbles: true }));
                firstInput.dispatchEvent(new Event('change', { bubbles: true }));
                
                logger.debug('[DevStore] Fallback 2 execCommand - Valeur:', firstInput.value);
                
                if (firstInput.value === projectName) {
                  logger.info("DevStore: Fallback 2 réussi avec execCommand!");
                  return true;
                }
              }
            } catch (e) {
              logger.debug('[DevStore] Erreur fallback 2:', e.message);
            }
          }
          
          // Fallback 3: Look specifically for input right after "Nom de la boutique" text
          logger.debug("DevStore: Fallback 3: recherche champ après texte "Nom de la boutique"");
          const scope = modalElement || document;
          const boutiqueTitleElements = Array.from(scope.querySelectorAll('*')).filter(el => {
            const text = (el.textContent || '').trim();
            return text.includes('Nom de la boutique') || text.includes('Store name');
          });
          
          logger.debug('[DevStore] Éléments contenant "Nom de la boutique":', boutiqueTitleElements.length);
          
          for (const titleEl of boutiqueTitleElements) {
            logger.debug('[DevStore] Titre trouvé:', titleEl.textContent.trim());
            
            // Look for the next input field after this title
            let nextElement = titleEl.nextElementSibling;
            let attempts = 0;
            
            while (nextElement && attempts < 5) {
              const input = nextElement.querySelector('input[type="text"], textarea') || 
                           (nextElement.tagName === 'INPUT' && nextElement.type === 'text' ? nextElement : null);
              
              if (input) {
                logger.debug('[DevStore] Input trouvé après titre "Nom de la boutique":', input);
                
                try {
                  logger.debug("DevStore: Tentative mise à jour fallback 3");
                  input.focus();
                  input.select();
                  
                  // Clear and wait
                  input.value = '';
                  const start = Date.now();
                  while (Date.now() - start < 200) {
                    // Synchronous wait
                  }
                  
                  // Set value with enhanced method
                  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                  nativeInputValueSetter.call(input, projectName);
                  input.value = projectName;
                  
                  // Comprehensive event triggering
                  input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                  input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                  
                  // Keyboard simulation
                  for (let i = 0; i < projectName.length; i++) {
                    const char = projectName[i];
                    input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
                    input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
                  }
                  
                  logger.debug('[DevStore] Fallback 3 - Valeur après mise à jour:', input.value);
                  
                  if (input.value === projectName) {
                    logger.info("DevStore: Fallback 3 réussi!");
                    return true;
                  } else {
                    // Try execCommand
                    input.focus();
                    input.select();
                    document.execCommand('selectAll');
                    document.execCommand('delete');
                    document.execCommand('insertText', false, projectName);
                    
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    logger.debug('[DevStore] Fallback 3 execCommand - Valeur:', input.value);
                    
                    if (input.value === projectName) {
                      logger.info("DevStore: Fallback 3 réussi avec execCommand!");
                      return true;
                    }
                  }
                } catch (e) {
                  logger.debug('[DevStore] Erreur fallback 3:', e.message);
                }
                break;
              }
              
              nextElement = nextElement.nextElementSibling;
              attempts++;
            }
          }
          
          logger.info("DevStore: Champ "Nom de la boutique" non trouvé");
          return false;
        }, projectName);
        }
        
        if (nameUpdated) {
          await sleep(1000);
          
          // Look for save button with enhanced debugging
          logger.debug("DevStore: Recherche bouton "Enregistrer/Sauvegarder" dans le modal");
          logger.debug("DevStore: Démarrage de la détection du bouton de sauvegarde");
          
          // First, let's check what's on the page from the outside
          logger.info("DevStore: === DEBUG EXTERNE AVANT page.evaluate() ===");
          logger.debug('[DevStore] URL courante:', page.url());
          
          try {
            const pageTitle = await page.title();
            logger.debug('[DevStore] Titre de la page:', pageTitle);
          } catch (e) {
            logger.debug('[DevStore] Erreur récupération titre:', e.message);
          }
          
          // Simple test to see if page.evaluate works at all
          try {
            const simpleTest = await page.evaluate(() => {
              logger.info("DevStore: TEST SIMPLE: page.evaluate fonctionne");
              return 'test-ok';
            });
            logger.debug('[DevStore] Résultat test simple:', simpleTest);
          } catch (e) {
            logger.debug('[DevStore] ERREUR TEST SIMPLE:', e.message);
          }
          
          let saveClicked = false;
          
          try {
            logger.debug("DevStore: Lancement de page.evaluate() pour recherche bouton");
            saveClicked = await page.evaluate(() => {
              // Force return false to disable the false positive
              logger.info("DevStore: === FORÇAGE DEBUG SIMPLE ===");
              logger.info("DevStore: Forcing return false to stop false positives");
              return false;
            });
          } catch (error) {
            logger.debug('[DevStore] ❌ ERREUR dans page.evaluate():', error.message);
            logger.debug('[DevStore] Stack trace:', error.stack);
            saveClicked = false;
          }
          
          logger.debug('[DevStore] Résultat page.evaluate() saveClicked:', saveClicked);
          
          // EXTERNAL DEBUGGING: Use Puppeteer to find buttons from outside
          logger.info("DevStore: === DEBUGGING EXTERNE AVEC PUPPETEER ===");
          
          try {
            // Get all button text using Puppeteer
            const allButtonTexts = await page.$$eval('button, input[type="submit"], [role="button"]', buttons => {
              return buttons.map((btn, idx) => {
                const rect = btn.getBoundingClientRect();
                return {
                  index: idx,
                  text: (btn.innerText || btn.textContent || btn.value || '').trim(),
                  visible: rect.width > 0 && rect.height > 0,
                  disabled: btn.disabled,
                  className: btn.className,
                  id: btn.id
                };
              });
            });
            
            logger.debug('[DevStore] TOUS LES BOUTONS (via Puppeteer):', allButtonTexts.length);
            allButtonTexts.forEach((btn, idx) => {
              logger.debug(`[DevStore] Bouton ${idx}:`, btn);
            });
            
            // Look specifically for "Enregistrer" buttons
            const enregistrerButtons = allButtonTexts.filter(btn => 
              btn.text === 'Enregistrer' || btn.text.toLowerCase() === 'enregistrer'
            );
            logger.debug('[DevStore] BOUTONS "Enregistrer" trouvés:', enregistrerButtons.length);
            enregistrerButtons.forEach(btn => {
              logger.debug('[DevStore] Bouton Enregistrer:', btn);
            });
            
                         // Try to click the first viable Enregistrer button using Puppeteer
             if (enregistrerButtons.length > 0) {
               const firstEnregistrer = enregistrerButtons.find(btn => 
                 btn.visible && 
                 !btn.disabled && 
                 !btn.className.includes('Polaris-Button--disabled')
               );
               if (firstEnregistrer) {
                logger.debug('[DevStore] TENTATIVE CLIC EXTERNE sur Enregistrer à l\'index:', firstEnregistrer.index);
                
                // Get the button element and click it
                const buttons = await page.$$('button, input[type="submit"], [role="button"]');
                if (buttons[firstEnregistrer.index]) {
                                     await buttons[firstEnregistrer.index].click();
                   logger.info("DevStore: ✅ CLIC EXTERNE RÉUSSI sur Enregistrer!");
                   
                   // Wait 6 seconds for modal to disappear after button click (debugging)
                   logger.debug("DevStore: ⏳ Attente de 4 secondes pour fermeture du modal (debug)");
                   await sleep(4000);
                   
                   // Since the process is working correctly, proceed with validation and closure
                   logger.info("DevStore: ✅ SAUVEGARDE RÉUSSIE - Fermeture du navigateur!");
                   saveClicked = true;
                   
                   logger.debug("DevStore: 🔄 Validation et fermeture en cours");
                   
                   try {
                     // Check if browser is still connected before proceeding
                     if (page.browser() && page.browser().isConnected()) {
                       // Validate the shop creation by updating hasShopify to true
                       if (global.currentShopValidation && global.currentShopValidation.meta) {
                         const { shopId, customerId } = global.currentShopValidation.meta;
                         const { getCustomersCollection } = require('../config/db');
                         const customersCollection = await getCustomersCollection();
                         
                         // Extract domain from current URL
                         const adminUrl = page.url();
                         const match = adminUrl.match(/^https:\/\/(.*?)\..*?\/admin/) || adminUrl.match(/^https:\/\/admin\.shopify\.com\/store\/(.*?)(?:\?|\/|$)/);
                         const domain = match ? match[1] : null;
                         
                         if (domain) {
                           await customersCollection.updateOne(
                             { _id: customerId, 'shops.shopId': shopId },
                             {
                               $set: {
                                 'shops.$.hasShopify': true,
                                 'shops.$.shopifyDomain': domain,
                                 'shops.$.shopifyAdminUrl': adminUrl,
                                 'shops.$.shopifyCreatedAt': new Date(),
                               },
                             }
                           );
                           logger.info("DevStore: ✅ Boutique validée dans le portail interne!");
                         }
                       }
                       
                       // Close the browser immediately
                       logger.debug("DevStore: 🔒 Fermeture immédiate du navigateur");
                       await page.browser().close();
                       
                       // Clean up global validation data
                       global.currentShopValidation = null;
                       
                       logger.info("DevStore: ✅ Processus terminé avec succès!");
                       
                       // Exit the function early since we're done
                       // Throw a special success signal to stop execution
                       throw new Error('SHOP_CREATED_SUCCESSFULLY');
                     } else {
                       logger.info("DevStore: ⚠️ Navigateur déjà fermé, validation ignorée");
                     }
                                        } catch (validationError) {
                       // Check if this is our success signal
                       if (validationError.message === 'SHOP_CREATED_SUCCESSFULLY') {
                         logger.info("DevStore: ✅ Signal de succès reçu - Arrêt du processus");
                         // Re-throw the success signal to be caught by the main handler
                         throw validationError;
                       }
                       
                       logger.error('[DevStore] ❌ Erreur lors de la validation:', validationError.message);
                       // Still try to close browser even if validation failed
                       try {
                         if (page.browser() && page.browser().isConnected()) {
                           await page.browser().close();
                         }
                       } catch (closeError) {
                         logger.error('[DevStore] ❌ Erreur fermeture navigateur:', closeError.message);
                       }
                     }
                } else {
                  logger.debug('[DevStore] ❌ Impossible de récupérer l\'élément bouton à l\'index:', firstEnregistrer.index);
                }
              } else {
                logger.info("DevStore: ❌ Aucun bouton Enregistrer viable (visible et activé)");
              }
            } else {
              logger.info("DevStore: ❌ Aucun bouton avec texte "Enregistrer" trouvé");
            }
            
          } catch (debugError) {
            // Check if this is our success signal
            if (debugError.message === 'SHOP_CREATED_SUCCESSFULLY') {
              logger.debug("DevStore: ✅ Signal de succès reçu dans debugging - Propagation");
              // Re-throw the success signal to be caught by the main handler
              throw debugError;
            }
            logger.debug('[DevStore] ❌ Erreur debugging externe:', debugError.message);
          }
          
          if (saveClicked) {
            logger.info("DevStore: Nom de la boutique sauvegardé avec succès!");
            await sleep(1000);
          } else {
            logger.warn('[DevStore] Bouton sauvegarder non trouvé');
          }
        } else {
          logger.warn('[DevStore] Champ nom de la boutique non trouvé');
        }
      } else {
        logger.warn('[DevStore] Icône crayon non trouvée dans "Détails de la boutique"');
        
        // Debug: show what we found on the page
        await page.evaluate(() => {
          logger.info("DevStore: === DEBUG: PAGE CONTENT ===");
          logger.debug('[DevStore] Title:', document.title);
          logger.debug('[DevStore] URL:', window.location.href);
          
          // Show first 500 chars of page text
          const pageText = document.body.innerText || '';
          logger.debug('[DevStore] Page text preview:', pageText.substring(0, 500));
          
          // Look for any text containing "boutique" or "détails"
          const boutique_elements = Array.from(document.querySelectorAll('*')).filter(el => {
            const text = (el.innerText || el.textContent || '').trim().toLowerCase();
            return text.includes('boutique') || text.includes('détails') || text.includes('store') || text.includes('details');
          });
          
          logger.debug('[DevStore] Éléments contenant "boutique/détails":', boutique_elements.length);
          boutique_elements.slice(0, 5).forEach((el, i) => {
            logger.debug(`[DevStore] Element ${i}:`, (el.innerText || el.textContent || '').trim().substring(0, 100));
          });
        });
      }
    } else {
      logger.warn('[DevStore] Navigation vers paramètres échouée - Bouton "Paramètres" non trouvé');
      logger.info("DevStore: Éléments disponibles sur la page:");
      
      // Debug: log available navigation elements
      await page.evaluate(() => {
        const navElements = Array.from(document.querySelectorAll('nav a, nav button, aside a, .sidebar a, [role="navigation"] a'));
        logger.debug('[DevStore] Éléments de navigation trouvés:', navElements.length);
        navElements.slice(0, 10).forEach((el, i) => {
          logger.debug(`[DevStore] Nav ${i}: "${(el.innerText || el.textContent || '').trim()}"`);
        });
        
        // Also check for any text containing "paramètres" or "settings"
        const allText = document.body.innerText.toLowerCase();
        if (allText.includes('paramètres') || allText.includes('settings')) {
          logger.info("DevStore: Le mot "paramètres" ou "settings" est présent sur la page");
        } else {
          logger.info("DevStore: Aucune mention de "paramètres" ou "settings" sur la page");
        }
      });
    }
  } catch (error) {
    // Check if this is our success signal
    if (error.message === 'SHOP_CREATED_SUCCESSFULLY') {
      logger.debug("DevStore: ✅ Signal de succès reçu dans updateShopNameInSettings - Propagation");
      // Re-throw the success signal to be caught by the calling function
      throw error;
    }
    logger.error('[DevStore] Erreur lors de la mise à jour du nom:', error.message);
    logger.debug('[DevStore] URL au moment de l\'erreur:', page.url());
  }
}

async function handleAllWizardSteps(page, storeName) {
  try {
    logger.debug("DevStore: Gestion séquentielle des étapes du wizard");
    
    // Step 2: "Entreprise existante" (current slide)
    logger.debug("DevStore: Étape 2: Recherche "Entreprise existante"");
    const entrepriseExistanteClicked = await page.evaluate(() => {
      const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
      
      for (const radio of radios) {
        const label = radio.labels?.[0]?.textContent || '';
        const parent = radio.closest('div, label, li')?.textContent || '';
        const combined = (label + ' ' + parent).toLowerCase();
        
        if (combined.includes('entreprise existante')) {
          logger.info("DevStore: Trouvé radio "Entreprise existante"");
          radio.click();
          return true;
        }
      }
      
      // Fallback: look for clickable elements with this text
      const elements = Array.from(document.querySelectorAll('label, div, li, span'));
      for (const element of elements) {
        const text = (element.innerText || element.textContent || '').trim();
        if (text === 'Entreprise existante') {
          logger.info("DevStore: Trouvé élément "Entreprise existante"");
          const radio = element.querySelector('input[type="radio"]') || 
                       element.closest('label')?.querySelector('input[type="radio"]') ||
                       element.closest('div')?.querySelector('input[type="radio"]');
          if (radio) {
            radio.click();
            return true;
          } else {
            element.click();
            return true;
          }
        }
      }
      return false;
    });
    
    logger.info("DevStore: Étape 2 résultat:', entrepriseExistanteClicked ? 'Succès' : 'Échec");
    
    if (entrepriseExistanteClicked) {
      await sleep(300); // Reduced from 1000ms
      
      // Click Suivant to go to step 3
      const suivant2 = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        for (const button of buttons) {
          const text = (button.innerText || '').trim().toLowerCase();
          if (text === 'suivant' || text === 'next') {
            logger.info("DevStore: Clic "Suivant" étape 2");
            button.click();
            return true;
          }
        }
        return false;
      });
      
              if (suivant2) {
          await sleep(800); // Reduced from 2000ms - Wait for slide transition
          
          // Step 3: "Que prévoyez-vous de vendre ?" → "Produits que j'achète ou fabrique moi‑même"
          logger.debug("DevStore: Étape 3: Recherche "Produits que j\'achète ou fabrique moi‑même"");
          const produitsAcheteFabriqueClicked = await page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]'));
            
            for (const input of inputs) {
              const label = input.labels?.[0]?.textContent || '';
              const parent = input.closest('div, label, li')?.textContent || '';
              const combined = (label + ' ' + parent).toLowerCase();
              
              if (combined.includes('produits que j\'achète ou fabrique moi‑même') ||
                  (combined.includes('achète ou fabrique') && combined.includes('moi'))) {
                logger.info("DevStore: Trouvé "Produits que j\'achète ou fabrique moi‑même"");
                input.click();
                return true;
              }
            }
            
            // Fallback: look for clickable elements
            const elements = Array.from(document.querySelectorAll('div, label, li, span'));
            for (const element of elements) {
              const text = (element.innerText || element.textContent || '').trim();
              if (text.includes('Produits que j\'achète ou fabrique moi‑même') ||
                  text.includes('Expédiés par moi-même')) {
                logger.info("DevStore: Trouvé élément "Produits que j\'achète ou fabrique moi‑même"");
                element.click();
                return true;
              }
            }
            return false;
          });
          
          if (produitsAcheteFabriqueClicked) {
            await sleep(300); // Reduced from 1000ms
            
            // Click Suivant for step 3
            const suivant3 = await page.evaluate(() => {
              const buttons = Array.from(document.querySelectorAll('button'));
              for (const button of buttons) {
                const text = (button.innerText || '').trim().toLowerCase();
                if (text === 'suivant' || text === 'next') {
                  logger.info("DevStore: Clic "Suivant" étape 3");
                  button.click();
                  return true;
                }
              }
              return false;
            });
          
                      if (suivant3) {
              await sleep(800); // Reduced from 2000ms - Wait for slide transition
              
              // Step 4: "Choisir un forfait" → Click "Passer"
              logger.debug("DevStore: Étape 4: Recherche bouton "Passer"");
              const passerClicked = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button, div[role="button"], a'));
                
                // First try to find by exact text
                for (const button of buttons) {
                  const text = (button.innerText || button.textContent || '').trim();
                  
                  if (text.includes('Passer') || text.includes('déciderai plus tard') || 
                      text.includes('Skip') || text.includes('later')) {
                    logger.debug('[DevStore] Trouvé bouton "Passer":', text);
                    button.click();
                    return true;
                  }
                }
                
                // Look for buttons in top-right area
                for (const button of buttons) {
                  const rect = button.getBoundingClientRect();
                  const text = (button.innerText || button.textContent || '').trim().toLowerCase();
                  
                  // Check if button is in top-right quadrant and has skip-like text
                  if (rect.right > window.innerWidth * 0.6 && rect.top < window.innerHeight * 0.3) {
                    if (text.includes('passer') || text.includes('skip') || text.includes('later')) {
                      logger.info("DevStore: Trouvé bouton top-right "Passer"");
                      button.click();
                      return true;
                    }
                  }
                }
                
                return false;
              });
              
              if (passerClicked) {
                logger.info("DevStore: Étape 4 terminée - "Passer" cliqué");
                await sleep(1500); // Reduced from 3000ms - Wait for navigation to admin page
                logger.info("DevStore: Wizard terminé avec succès!");
                
                // Final step: Update shop name in settings
                logger.debug("DevStore: Étape finale: Mise à jour du nom de la boutique");
                // Wait for redirect to admin page
                await sleep(1500); // Reduced from 3000ms
                logger.debug('[DevStore] Page courante après wizard:', page.url());
                
                try {
                  await updateShopNameInSettings(page, storeName);
                } catch (error) {
                  if (error.message === 'SHOP_CREATED_SUCCESSFULLY') {
                    logger.info("DevStore: ✅ Boutique créée et validée avec succès!");
                    // Extract domain from current URL before returning
                    const adminUrl = page.url();
                    const match = adminUrl.match(/^https:\/\/(.*?)\..*?\/admin/) || adminUrl.match(/^https:\/\/admin\.shopify\.com\/store\/(.*?)(?:\?|\/|$)/);
                    const domain = match ? match[1] : null;
                    
                    if (domain) {
                      return { domain, adminUrl, storeName, success: true, shopValidated: true };
                    } else {
                      throw new Error(`Cannot detect domain from URL: ${adminUrl}`);
                    }
                  } else {
                    throw error; // Re-throw other errors
                  }
                }
                
                // Extract domain and return success
                const adminUrl = page.url();
                logger.debug('[DevStore] URL finale:', adminUrl);
                
                const match = adminUrl.match(/^https:\/\/(.*?)\..*?\/admin/) || adminUrl.match(/^https:\/\/admin\.shopify\.com\/store\/(.*?)(?:\?|\/|$)/);
                if (!match) {
                  throw new Error(`Cannot detect domain from URL: ${adminUrl}`);
                }
                
                const domain = match[1];
                logger.debug('[DevStore] domaine détecté:', domain);
                
                return { domain, adminUrl, storeName, success: true };
              } else {
                logger.warn('[DevStore] Bouton "Passer" non trouvé à l\'étape 4');
                
                // Continue with remaining steps in case this isn't the final step
                const suivant4 = await page.evaluate(() => {
                  const buttons = Array.from(document.querySelectorAll('button'));
                  for (const button of buttons) {
                    const text = (button.innerText || '').trim().toLowerCase();
                    if (text === 'suivant' || text === 'next') {
                      logger.info("DevStore: Fallback: Clic "Suivant" étape 4");
                      button.click();
                      return true;
                    }
                  }
                  return false;
                });
              
                              if (suivant4) {
                  await sleep(800); // Reduced from 2000ms - Wait for slide transition
                  
                  // Step 5: "Vendez-vous actuellement sur d'autres plateformes ?" → "Non, je n'utilise aucune plateforme"
                  logger.debug("DevStore: Étape 5: Recherche "Non, je n\'utilise aucune plateforme"");
                  const aucunePlateformeClicked = await page.evaluate(() => {
                    const inputs = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]'));
                    
                    for (const input of inputs) {
                      const label = input.labels?.[0]?.textContent || '';
                      const parent = input.closest('div, label, li')?.textContent || '';
                      const combined = (label + ' ' + parent).toLowerCase();
                      
                      if (combined.includes('aucune plateforme') || combined.includes('je n\'utilise aucune')) {
                        logger.info("DevStore: Trouvé "Aucune plateforme"");
                        input.click();
                        return true;
                      }
                    }
                    
                    // Fallback
                    const elements = Array.from(document.querySelectorAll('div, label, li, span'));
                    for (const element of elements) {
                      const text = (element.innerText || element.textContent || '').trim();
                      if (text.includes('Non, je n\'utilise aucune plateforme')) {
                        logger.info("DevStore: Trouvé élément "Aucune plateforme"");
                        element.click();
                        return true;
                      }
                    }
                    return false;
                  });
                  
                  if (aucunePlateformeClicked) {
                    await sleep(300); // Reduced from 1000ms
                    
                    // Click Suivant for step 5
                    const suivant5 = await page.evaluate(() => {
                      const buttons = Array.from(document.querySelectorAll('button'));
                      for (const button of buttons) {
                        const text = (button.innerText || '').trim().toLowerCase();
                        if (text === 'suivant' || text === 'next') {
                          logger.info("DevStore: Clic "Suivant" étape 5");
                          button.click();
                          return true;
                        }
                      }
                      return false;
                    });
                  
                  if (suivant5) {
                    await sleep(800); // Reduced from 2000ms - Wait for slide transition
                    
                    // Step 6: "Passer, je déciderai plus tard"
                    logger.debug("DevStore: Étape 6: Recherche "Passer, je déciderai plus tard"");
                    const passerClicked = await page.evaluate(() => {
                      const buttons = Array.from(document.querySelectorAll('button, div[role="button"], a'));
                      
                      for (const button of buttons) {
                        const text = (button.innerText || button.textContent || '').trim();
                        
                        if (text.includes('Passer') || text.includes('déciderai plus tard') || 
                            text.includes('Skip') || text.includes('later')) {
                          logger.debug('[DevStore] Trouvé "Passer":', text);
                          button.click();
                          return true;
                        }
                      }
                      
                      // Look for buttons in top-right area
                      for (const button of buttons) {
                        const rect = button.getBoundingClientRect();
                        const text = (button.innerText || '').trim().toLowerCase();
                        
                        if (rect.right > window.innerWidth * 0.6 && rect.top < window.innerHeight * 0.3) {
                          if (text.includes('passer') || text.includes('skip')) {
                            logger.info("DevStore: Trouvé bouton top-right "Passer"");
                            button.click();
                            return true;
                          }
                        }
                      }
                      return false;
                    });
                    
                    if (passerClicked) {
                      logger.info("DevStore: Wizard terminé avec succès!");
                      
                      // Wait for admin page and extract domain
                      await sleep(2000);
                      const adminUrl = page.url();
                      logger.debug('[DevStore] URL finale:', adminUrl);
                      
                      const match = adminUrl.match(/^https:\/\/(.*?)\..*?\/admin/) || adminUrl.match(/^https:\/\/admin\.shopify\.com\/store\/(.*?)(?:\?|\/|$)/);
                      if (!match) {
                        throw new Error(`Cannot detect domain from URL: ${adminUrl}`);
                      }
                      
                      const domain = match[1];
                      logger.debug('[DevStore] domaine détecté:', domain);
                      
                      return { domain, adminUrl, storeName, success: true };
                    } else {
                      logger.warn('[DevStore] Bouton "Passer" non trouvé');
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  } catch (error) {
    logger.error('[DevStore] Erreur dans handleAllWizardSteps:', error.message);
  }
}

module.exports = {
  startDevStore,
  continueDevStore,
  continueCaptcha,
}; 

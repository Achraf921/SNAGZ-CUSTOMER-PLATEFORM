// Component preloader utility for better performance
// This file helps preload components intelligently based on user navigation patterns

class ComponentPreloader {
  constructor() {
    this.preloadedComponents = new Set();
    this.preloadQueue = [];
    this.isPreloading = false;
  }

  // Preload a component with priority
  async preloadComponent(importFunction, componentName, priority = 'normal') {
    if (this.preloadedComponents.has(componentName)) {
      return; // Already preloaded
    }

    // Defensive check to prevent circular dependencies
    if (typeof importFunction !== 'function') {
      console.warn(`Invalid import function for component: ${componentName}`);
      return;
    }

    const preloadTask = {
      importFunction,
      componentName,
      priority,
      timestamp: Date.now()
    };

    // Add to queue based on priority
    if (priority === 'high') {
      this.preloadQueue.unshift(preloadTask);
    } else {
      this.preloadQueue.push(preloadTask);
    }

    // Start processing queue if not already processing
    if (!this.isPreloading) {
      // Small delay to prevent immediate circular dependency issues
      setTimeout(() => this.processPreloadQueue(), 100);
    }
  }

  // Process the preload queue
  async processPreloadQueue() {
    if (this.isPreloading) {
      return; // Already processing
    }
    
    this.isPreloading = true;

    while (this.preloadQueue.length > 0) {
      const task = this.preloadQueue.shift();
      
      try {
        // Only preload if component hasn't been loaded yet
        if (!this.preloadedComponents.has(task.componentName)) {
          // Additional safety check before import
          if (typeof task.importFunction === 'function') {
            await task.importFunction();
            this.preloadedComponents.add(task.componentName);
            console.debug(`✅ Preloaded component: ${task.componentName}`);
          }
        }
      } catch (error) {
        console.warn(`❌ Failed to preload component: ${task.componentName}`, error);
        // Don't let one failed preload break the entire queue
      }

      // Small delay between preloads to avoid blocking main thread
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    this.isPreloading = false;
  }

  // Preload components based on current route
  preloadByRoute(currentPath) {
    // Customer portal preloading
    if (currentPath.startsWith('/client/')) {
      this.preloadCustomerComponents();
    }
    // Internal portal preloading
    else if (currentPath.startsWith('/internal/')) {
      this.preloadInternalComponents();
    }
    // Admin portal preloading
    else if (currentPath.startsWith('/admin/')) {
      this.preloadAdminComponents();
    }
    // Main page preloading
    else if (currentPath === '/') {
      this.preloadAuthComponents();
    }
  }

  // Preload customer portal components
  preloadCustomerComponents() {
    // High priority - likely next navigations
    this.preloadComponent(
      () => import('../components/customer/MesBoutiques.jsx'),
      'MesBoutiques',
      'high'
    );
    this.preloadComponent(
      () => import('../components/customer/MesProduits.jsx'),
      'MesProduits',
      'high'
    );

    // Normal priority - secondary navigations
    this.preloadComponent(
      () => import('../components/customer/CreateShop.jsx'),
      'CreateShop'
    );
    this.preloadComponent(
      () => import('../components/customer/CreateProduct.jsx'),
      'CreateProduct'
    );
    this.preloadComponent(
      () => import('../components/customer/ManageAccount.jsx'),
      'ManageAccount'
    );
  }

  // Preload internal portal components
  preloadInternalComponents() {
    // High priority - core internal functions
    this.preloadComponent(
      () => import('../components/internal/AllShops.jsx'),
      'AllShops',
      'high'
    );
    this.preloadComponent(
      () => import('../components/internal/ClientsList.jsx'),
      'ClientsList',
      'high'
    );
    this.preloadComponent(
      () => import('../components/internal/Produits.jsx'),
      'Produits',
      'high'
    );

    // Normal priority - secondary functions
    this.preloadComponent(
      () => import('../components/internal/DocumentationSection.jsx'),
      'DocumentationSection'
    );
    this.preloadComponent(
      () => import('../components/internal/BoutiquesAValider.jsx'),
      'BoutiquesAValider'
    );
    this.preloadComponent(
      () => import('../components/internal/Statistics.jsx'),
      'Statistics'
    );

    // Shopify components (lower priority unless on shopify routes)
    if (window.location.pathname.includes('shopify')) {
      this.preloadShopifyComponents();
    }
  }

  // Preload Shopify-specific components
  preloadShopifyComponents() {
    this.preloadComponent(
      () => import('../components/internal/shopify/ShopifyConfiguration.jsx'),
      'ShopifyConfiguration',
      'high'
    );
    this.preloadComponent(
      () => import('../components/internal/shopify/FicheProduitsShopify.jsx'),
      'FicheProduitsShopify',
      'high'
    );
    this.preloadComponent(
      () => import('../components/internal/shopify/GenerationEC.jsx'),
      'GenerationEC',
      'high'
    );
  }

  // Preload admin portal components
  preloadAdminComponents() {
    this.preloadComponent(
      () => import('../components/admin/AdminClientAccounts.jsx'),
      'AdminClientAccounts',
      'high'
    );
    this.preloadComponent(
      () => import('../components/admin/AdminInternalAccounts.jsx'),
      'AdminInternalAccounts'
    );
    this.preloadComponent(
      () => import('../components/admin/AdminAccounts.jsx'),
      'AdminAccounts'
    );
    this.preloadComponent(
      () => import('../components/admin/AdminProfile.jsx'),
      'AdminProfile'
    );
  }

  // Preload authentication components
  preloadAuthComponents() {
    // These are likely to be needed from the main page
    this.preloadComponent(
      () => import('../components/auth/ResetPasswordPage.jsx'),
      'ResetPasswordPage'
    );
    this.preloadComponent(
      () => import('../components/pages/ConditionsGenerales.jsx'),
      'ConditionsGenerales'
    );
    this.preloadComponent(
      () => import('../components/pages/QuiNousSommes.jsx'),
      'QuiNousSommes'
    );
  }

  // Preload on user interaction (hover, focus)
  preloadOnInteraction(componentName, importFunction) {
    // Debounced preloading to avoid excessive calls
    if (!this.preloadedComponents.has(componentName)) {
      setTimeout(() => {
        this.preloadComponent(importFunction, componentName, 'high');
      }, 100);
    }
  }

  // Clear preload cache (useful for memory management)
  clearCache() {
    this.preloadedComponents.clear();
    this.preloadQueue = [];
    this.isPreloading = false;
  }

  // Get preload status
  getStatus() {
    return {
      preloaded: Array.from(this.preloadedComponents),
      queueLength: this.preloadQueue.length,
      isPreloading: this.isPreloading
    };
  }
}

// Create singleton instance
const componentPreloader = new ComponentPreloader();

// Auto-preload based on current route when utility loads
if (typeof window !== 'undefined') {
  // Small delay to ensure the page is loaded
  setTimeout(() => {
    componentPreloader.preloadByRoute(window.location.pathname);
  }, 1000);

  // Listen for visibility changes to pause/resume preloading
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Pause preloading when tab is not visible
      componentPreloader.isPreloading = false;
    } else {
      // Resume preloading when tab becomes visible
      if (componentPreloader.preloadQueue.length > 0) {
        componentPreloader.processPreloadQueue();
      }
    }
  });
}

export default componentPreloader; 
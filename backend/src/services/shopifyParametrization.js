const axios = require('axios');

/**
 * GraphQL-based Shopify Shop Parametrization Service
 * 
 * Note: Based on Shopify GraphQL Admin API research, the following limitations exist:
 * - Shop billing address is READ-ONLY via GraphQL (no shopUpdate mutation available)
 * - Order prefix settings are READ-ONLY via GraphQL 
 * 
 * These settings must be updated through:
 * 1. Shopify Admin UI (manually)
 * 2. REST Admin API (if available)
 * 3. Private app with appropriate scopes
 */

class ShopifyGraphQLParametrization {
    constructor(shopDomain, accessToken) {
        console.log(`🔧 ShopifyGraphQLParametrization constructor called`);
        console.log(`🔧 shopDomain: ${shopDomain}`);
        console.log(`🔧 accessToken: ${accessToken?.substring(0, 20)}...`);
        
        this.shopDomain = shopDomain;
        this.accessToken = accessToken;
        
        // Ensure we have the full .myshopify.com domain
        const fullDomain = shopDomain.includes('.myshopify.com') 
            ? shopDomain 
            : `${shopDomain}.myshopify.com`;
            
        this.graphqlEndpoint = `https://${fullDomain}/admin/api/2024-04/graphql.json`;
        
        console.log(`🔧 GraphQL endpoint: ${this.graphqlEndpoint}`);
    }

    /**
     * Make a GraphQL request to Shopify Admin API
     */
    async makeGraphQLRequest(query, variables = {}) {
        try {
            console.log(`🔧 Making GraphQL request to: ${this.graphqlEndpoint}`);
            console.log(`🔧 Access token being used: ${this.accessToken?.substring(0, 20)}...`);
            console.log(`🔧 Query: ${query.substring(0, 100)}...`);
            
            const response = await axios({
                method: 'POST',
                url: this.graphqlEndpoint,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': this.accessToken
                },
                data: {
                    query,
                    variables
                }
            });

            if (response.data.errors) {
                throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
            }

            return response.data.data;
        } catch (error) {
            console.error('GraphQL request failed:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get current shop information including billing address (read-only)
     */
    async getShopInfo() {
        const query = `
            query getShopInfo {
                shop {
                    id
                    name
                    email
                    contactEmail
                    billingAddress {
                        company
                        address1
                        address2
                        city
                        province
                        country
                        zip
                    }
                    orderNumberFormatPrefix
                    orderNumberFormatSuffix
                    currencyCode
                    features {
                        storefront
                        multiLocation
                    }
                }
            }
        `;

        return await this.makeGraphQLRequest(query);
    }

    /**
     * Check if the shop settings match our desired configuration
     */
    async checkParametrizationStatus() {
        try {
            const shopData = await this.getShopInfo();
            const shop = shopData.shop;

            const desiredBilling = {
                company: "sna gz",
                country: "France",
                address1: "Za de saint anne",
                zip: "61190",
                city: "Tourouvre au perche"
            };

            const currentBilling = shop.billingAddress;
            
            const billingMatch = 
                currentBilling.company === desiredBilling.company &&
                currentBilling.country === desiredBilling.country &&
                currentBilling.address1 === desiredBilling.address1 &&
                currentBilling.zip === desiredBilling.zip &&
                currentBilling.city === desiredBilling.city;

            // Note: We can't check order prefix programmatically as it requires the project name
            // which is dynamic per shop
            
            return {
                shopInfo: shop,
                billingConfigured: billingMatch,
                orderPrefixConfigured: null, // Cannot verify without knowing expected prefix
                requiresManualSetup: !billingMatch,
                manualSetupRequired: [
                    ...(!billingMatch ? ['Billing Address'] : []),
                    'Order Prefix' // Always needs manual setup as it's not configurable via GraphQL
                ]
            };
        } catch (error) {
            console.error('Error checking parametrization status:', error);
            throw error;
        }
    }

    /**
     * Since GraphQL doesn't support updating shop billing/order settings,
     * this method provides instructions for manual setup
     */
    async getManualSetupInstructions(projectName) {
        const shopInfo = await this.getShopInfo();
        
        const fullDomain = this.shopDomain.includes('.myshopify.com') 
            ? this.shopDomain 
            : `${this.shopDomain}.myshopify.com`;
        
        return {
            success: false,
            requiresManualSetup: true,
            shopUrl: `https://${fullDomain}/admin`,
            instructions: {
                billingAddress: {
                    path: "Settings > General > Store details",
                    fields: {
                        "Raison sociale": "sna gz",
                        "Pays/région": "France",
                        "Adresse": "Za de saint anne",
                        "Code postal": "61190",
                        "Ville": "Tourouvre au perche"
                    }
                },
                orderPrefix: {
                    path: "Settings > Checkout > Order ID format",
                    field: "Prefix",
                    value: `#${projectName.toUpperCase()}`
                }
            },
            currentSettings: {
                billingAddress: shopInfo.shop.billingAddress,
                orderPrefix: shopInfo.shop.orderNumberFormatPrefix
            }
        };
    }

    /**
     * Alternative: Try to use REST API for settings that GraphQL doesn't support
     * Note: This requires additional REST API access tokens and scopes
     */
    async attemptRestAPIParametrization(projectName) {
        const fullDomain = this.shopDomain.includes('.myshopify.com') 
            ? this.shopDomain 
            : `${this.shopDomain}.myshopify.com`;
        const restEndpoint = `https://${fullDomain}/admin/api/2024-04/shop.json`;
        
        try {
            // First, get current shop data via REST
            const getResponse = await axios({
                method: 'GET',
                url: restEndpoint,
                headers: {
                    'X-Shopify-Access-Token': this.accessToken
                }
            });

            // Attempt to update shop settings via REST
            const updateData = {
                shop: {
                    // Billing address fields (if supported in REST)
                    address1: "Za de saint anne",
                    city: "Tourouvre au perche",
                    province: "",
                    country: "France",
                    zip: "61190",
                    // Order format (if supported)
                    order_number_format: `${projectName.toUpperCase()}{{number}}`
                }
            };

            const updateResponse = await axios({
                method: 'PUT',
                url: restEndpoint,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': this.accessToken
                },
                data: updateData
            });

            return {
                success: true,
                method: 'REST API',
                updatedFields: updateData.shop
            };

        } catch (error) {
            console.error('REST API parametrization failed:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.errors || error.message,
                fallbackToManual: true
            };
        }
    }
}

/**
 * Main parametrization function using GraphQL approach
 */
async function parametrizeShopViaGraphQL(shopDomain, accessToken, projectName) {
    try {
        const parametrizer = new ShopifyGraphQLParametrization(shopDomain, accessToken);
        
        console.log(`🔧 Starting GraphQL-based parametrization for ${shopDomain}...`);
        
        // First, check current status
        const status = await parametrizer.checkParametrizationStatus();
        console.log('Current parametrization status:', status);
        
        if (status.requiresManualSetup) {
            console.log('⚠️ GraphQL limitations detected. Attempting REST API fallback...');
            
            // Try REST API approach
            const restResult = await parametrizer.attemptRestAPIParametrization(projectName);
            
            if (restResult.success) {
                console.log('✅ Successfully parametrized via REST API');
                return {
                    success: true,
                    method: 'REST API',
                    parametrized: true,
                    details: restResult
                };
            } else {
                console.log('❌ REST API also failed. Manual setup required.');
                
                // Provide manual setup instructions
                const instructions = await parametrizer.getManualSetupInstructions(projectName);
                
                return {
                    success: false,
                    method: 'Manual Setup Required',
                    parametrized: false,
                    requiresManualSetup: true,
                    instructions: instructions
                };
            }
        } else {
            console.log('✅ Shop is already properly parametrized');
            return {
                success: true,
                method: 'Already Configured',
                parametrized: true,
                shopInfo: status.shopInfo
            };
        }
        
    } catch (error) {
        console.error('Parametrization error:', error);
        return {
            success: false,
            error: error.message,
            parametrized: false
        };
    }
}

/**
 * Verify shop parametrization status
 */
async function verifyShopParametrization(shopDomain, accessToken) {
    try {
        const parametrizer = new ShopifyGraphQLParametrization(shopDomain, accessToken);
        const status = await parametrizer.checkParametrizationStatus();
        
        return {
            success: true,
            ...status
        };
    } catch (error) {
        console.error('Verification error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    parametrizeShopViaGraphQL,
    verifyShopParametrization,
    ShopifyGraphQLParametrization
};
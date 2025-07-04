# Shopify Shop Parametrization - GraphQL Implementation

## Overview

This implementation has been updated to use Shopify's GraphQL Admin API instead of UI scraping for shop parametrization. This approach is more reliable, professional, and maintainable.

## Important Limitations

**⚠️ Based on Shopify GraphQL Admin API research, the following settings are READ-ONLY via GraphQL:**

- **Shop billing address** - Cannot be updated via GraphQL mutations
- **Order prefix settings** - Cannot be updated via GraphQL mutations

These settings must be configured through:
1. **Shopify Admin UI** (manually)
2. **REST Admin API** (if available with proper scopes)
3. **Private app** with appropriate access tokens and scopes

## Required Fields for Parametrization

### Billing Information (Information de facturation)
- **Raison sociale**: "sna gz"
- **Pays/région**: "France" 
- **Adresse**: "Za de saint anne"
- **Code postal**: "61190"
- **Ville**: "Tourouvre au perche"

### Order Reference (Référence de commande)
- **Préfixe**: "#nomProjet.toUpperCase()" (shop project name in uppercase)

## API Usage

### Authentication Required

The user must provide a **Shopify Private App Access Token** with the following scopes:
- `read_shop_information`
- `write_shop_information`

### How to Create a Private App Access Token

1. Go to **Shopify Admin** → **Settings** → **Apps and sales channels**
2. Click on **"Develop apps"**
3. Create a new private app
4. Enable the required scopes: `read_shop_information` and `write_shop_information`
5. Copy the generated access token (starts with `shpat_`)

### API Endpoint

```http
POST /api/shopify/parametrize/:shopId
Content-Type: application/json

{
  "accessToken": "shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

### Response Types

#### 1. Manual Setup Required (Most Common)
```json
{
  "success": true,
  "message": "Paramétrage analysé - Configuration manuelle requise",
  "result": {
    "requiresManualSetup": true,
    "instructions": {
      "billingAddress": {
        "path": "Settings > General > Store details",
        "fields": {
          "Raison sociale": "sna gz",
          "Pays/région": "France",
          "Adresse": "Za de saint anne",
          "Code postal": "61190",
          "Ville": "Tourouvre au perche"
        }
      },
      "orderPrefix": {
        "path": "Settings > Checkout > Order ID format",
        "field": "Prefix",
        "value": "#PROJECTNAME"
      }
    },
    "shopUrl": "https://myshop.myshopify.com/admin"
  }
}
```

#### 2. Already Configured
```json
{
  "success": true,
  "message": "Shop déjà paramétré correctement",
  "result": {
    "method": "Already Configured",
    "shopInfo": { ... }
  }
}
```

#### 3. Error Response
```json
{
  "success": false,
  "error": "Access token requis",
  "instructions": {
    "step1": "Créez une app privée dans votre Shopify Admin",
    "step2": "Allez dans Settings > Apps and sales channels > Develop apps",
    "step3": "Créez une nouvelle app avec les scopes: read_shop_information, write_shop_information",
    "step4": "Copiez l'access token et l'envoyez dans cette requête"
  }
}
```

## Implementation Details

### Backend Service: `shopifyParametrization.js`

The service provides:

1. **`ShopifyGraphQLParametrization` class**: Handles GraphQL operations
2. **`parametrizeShopViaGraphQL()`**: Main parametrization function
3. **`verifyShopParametrization()`**: Verification function

### Key Features

- **GraphQL-first approach**: Uses Shopify's official GraphQL Admin API
- **Fallback to REST API**: Attempts REST API if GraphQL limitations are detected
- **Manual instructions**: Provides clear manual setup instructions when automatic configuration isn't possible
- **Status verification**: Can check current shop configuration status

### Frontend Integration

The frontend now:

1. **Prompts for access token**: Shows a modal requesting the Shopify access token
2. **Provides instructions**: Shows step-by-step guide for creating private apps
3. **Displays manual setup steps**: When automatic configuration isn't possible, shows clear manual instructions
4. **Links to Shopify Admin**: Provides direct links to relevant settings pages

## Migration Benefits

### From UI Scraping to GraphQL

1. **Reliability**: No more brittleness from DOM changes
2. **Performance**: Faster API calls vs. browser automation
3. **Rate limiting**: Better handling of API limits
4. **Maintainability**: Cleaner, more understandable code
5. **Professional**: Uses official Shopify APIs

### Trade-offs

- **Manual setup required**: Some settings must be configured manually
- **Access token needed**: Users must create private apps
- **Limited automation**: Cannot fully automate all shop settings

## Usage in Development

### Shop Creation Flow

When a new shop is created:
1. Shop is created successfully
2. Parametrization is marked as "requires manual setup"
3. User can use the "🔧 Paramétrer" button to initiate configuration
4. System guides user through access token creation and manual setup

### Testing

To test the parametrization:

1. Create a development store
2. Get the shop ID from the database
3. Create a private app in the Shopify Admin
4. Use the API endpoint with the access token
5. Follow the manual setup instructions provided

## Security Considerations

- **Access tokens are not stored**: Tokens are only used for the request and not persisted
- **Scoped permissions**: Only requests minimal required scopes
- **Error handling**: Sensitive information is not exposed in error messages

## Future Improvements

1. **REST API integration**: If Shopify provides REST endpoints for these settings
2. **Webhook integration**: Listen for shop setting changes
3. **Bulk operations**: Handle multiple shops simultaneously
4. **Settings templates**: Pre-configured setting templates for different business types

---

This implementation provides a more robust and maintainable solution while acknowledging the current limitations of Shopify's GraphQL API for certain shop settings. 
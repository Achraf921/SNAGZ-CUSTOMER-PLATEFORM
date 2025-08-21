# Guide d'Intégration Shopify - API GraphQL 2025-07

## Vue d'ensemble

Cette implémentation utilise l'API GraphQL Admin de Shopify version 2025-07 pour créer des produits avec un flux moderne en **quatre étapes** :

1. **Création du produit de base** (`productCreate`)
2. **Ajout d'options produit** (`productUpdate` - si tailles/couleurs)
3. **Création de variantes** (`productVariantsBulkCreate`)
4. **Mise à jour des stocks** (`inventoryAdjustQuantities`)

## Configuration requise

### 1. Credentials Shopify dans la base de données

Pour chaque boutique, vous devez avoir dans le document :

```javascript
{
  // ... autres champs de la boutique
  "shopifyConfig": {
    "apiKey": "yourShopifyApiKey",
    "apiSecret": "yourShopifyApiSecret", 
    "accessToken": "yourShopifyToken"
  },
  "shopifyDomain": "yourShopifyDomain"
}
```

**Format alternatif supporté (aplati) :**
```javascript
{
  "shopifyConfig.apiKey": "yourShopifyApiKey",
  "shopifyConfig.apiSecret": "yourShopifyApiSecret",
  "shopifyConfig.accessToken": "yourShopifyToken"
}
```

### 2. Permissions requises pour l'app Shopify

- `write_products`
- `read_products` 
- `write_inventory`
- `read_inventory`

### 2. Structure des produits dans MongoDB

```javascript
{
  "productId": "unique-id",
  "titre": "Nom du produit",
  "description": "Description du produit",
  "prix": 29.99,
  "sku": "PROD-001", // ⭐ NOUVEAU: SKU dédié (priorité sur codeEAN)
  "codeEAN": "1234567890123",
  "typeProduit": "T-shirt",
  "tailles": ["S", "M", "L"], // ⭐ Génère des options Shopify
  "couleurs": ["Rouge", "Bleu"], // ⭐ Génère des options Shopify
  "stock": { // ⭐ Stock par variante
    "S-Rouge": 10,
    "S-Bleu": 5,
    "M-Rouge": 15,
    "M-Bleu": 8,
    "L-Rouge": 12,
    "L-Bleu": 6
  },
  "hasShopify": false // ⭐ Mis à jour automatiquement après publication
}
```

## Fonctionnalités

### 1. Gestion des Variantes

**Cas 1: Tailles ET Couleurs**
- Crée toutes les combinaisons possibles (S-Rouge, S-Bleu, M-Rouge, etc.)
- Chaque variante a son propre stock et SKU

**Cas 2: Tailles seulement**
- Une variante par taille (S, M, L)
- Stock individuel par taille

**Cas 3: Couleurs seulement**
- Une variante par couleur (Rouge, Bleu)
- Stock individuel par couleur

**Cas 4: Aucune variante**
- Un seul produit simple
- Stock global

### 2. Mapping des SKU

Priorité des champs pour le SKU :
1. `prod.sku` (champ dédié) ⭐ NOUVEAU
2. `prod.codeEAN` ou `prod.ean` 
3. `SKU-${timestamp}` (fallback)

Format pour variantes :
- Avec tailles/couleurs: `{sku}-{taille}-{couleur}`
- Avec tailles seules: `{sku}-{taille}`
- Avec couleurs seules: `{sku}-{couleur}`

### 3. Interface Utilisateur

**Indicateurs visuels:**
- ✅ **Bordure verte** : Produits publiés (`hasShopify: true`)
- 🏷️ **Badge "Publié sur Shopify"** : Statut visible
- 📦 **Affichage tailles/couleurs** : Dans les détails produit

**Fonctionnalités:**
- ☑️ **"Sélectionner tous"** : Checkbox par boutique
- 🔄 **Actualisation automatique** : Après publication
- 📊 **Résultats détaillés** : Succès/échecs par produit

## Flux de Publication

### Étape 1: Création du produit de base
```graphql
mutation productCreate($input: ProductInput!) {
  productCreate(input: $input) {
    product { id title }
    userErrors { field message }
  }
}
```

### Étape 2: Ajout d'options (si variantes)
```graphql
mutation productUpdate($input: ProductInput!) {
  productUpdate(input: $input) {
    product { 
      options { name values }
    }
  }
}
```

### Étape 3: Création des variantes
```graphql
mutation productVariantsBulkCreate(
  $productId: ID!,
  $strategy: ProductVariantsBulkCreateStrategy!,
  $variants: [ProductVariantsBulkInput!]!
) {
  productVariantsBulkCreate(
    productId: $productId,
    strategy: $strategy,
    variants: $variants
  ) {
    productVariants {
      id sku price
      inventoryItem { id }
    }
  }
}
```

### Étape 4: Mise à jour des stocks
```graphql
mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
  inventoryAdjustQuantities(input: $input) {
    userErrors { field message }
  }
}
```

## Mapping vers Shopify

- `titre` → `title`
- `description` → `descriptionHtml`
- `prix` → variant `price`
- `sku` → variant `inventoryItem.sku` ⭐ PRIORITÉ
- `codeEAN/ean` → variant `barcode`
- `typeProduit` → `productType`
- `tailles` → option "Size" + variants
- `couleurs` → option "Color" + variants
- `stock` → `inventoryAdjustQuantities` par variante
- `caracteristiques` → metafield `custom.specifications`

## Limitations Connues

- ❌ `weight` : Non supporté dans l'API 2025-07
- ⚠️ Metafields : Limités aux spécifications
- 📍 Location : Utilise l'emplacement principal automatiquement

## Logs et Debugging

Les logs détaillent chaque étape :
```
[Shopify] Processing product: Nom du produit
[Shopify] Creating product with input: {...}
[Shopify] Adding product options: [Size, Color]
[Shopify] Creating 6 variant(s) with input: {...}
[Shopify] Updating inventory for variant SKU-S-Rouge with quantity 10
[Shopify] Product "Nom" successfully created with 6 variant(s)
```

## Statuts de Base de Données

Après publication réussie, le produit est automatiquement mis à jour :
```javascript
{
  "hasShopify": true,
  "shopifyProductId": "gid://shopify/Product/123456",
  "shopifyUpdatedAt": "2025-01-23T10:30:00Z"
}
```

Cette mise à jour permet l'affichage des indicateurs visuels dans l'interface.

## API Endpoints

### 1. Publication de produits

**Endpoint :** `PUT /api/internal/shopify/shop/:shopId/publish-products`

**Body :**
```json
{
  "productIds": ["686506390e6dd5ae60fc481e", "..."]
}
```

**Réponse succès :**
```json
{
  "success": true,
  "message": "2/3 produits publiés avec succès",
  "totalProcessed": 3,
  "successCount": 2,
  "failureCount": 1,
  "results": [
    {
      "productId": "686506390e6dd5ae60fc481e",
      "title": "Waffle",
      "success": true,
      "shopifyProductId": "gid://shopify/Product/123456789",
      "shopifyVariantId": "gid://shopify/ProductVariant/987654321",
      "sku": "678910",
      "price": "7.99"
    },
    {
      "productId": "686506390e6dd5ae60fc481f",
      "title": "Croissant",
      "success": false,
      "error": "Variant creation failed: SKU already exists"
    }
  ]
}
```

**Réponse erreur credentials :**
```json
{
  "error": "Credentials Shopify manquants",
  "missing": ["accessToken"],
  "present": ["apiKey", "apiSecret"]
}
```

## Flux d'utilisation Frontend

### 1. Vérification automatique des credentials

Le composant `FicheProduitsShopify` vérifie automatiquement si les credentials sont présents :

```javascript
// Vérification avant publication
const config = shop.shopifyConfig || {};
const apiKey = config.apiKey || shop.apiKey || shop["shopifyConfig.apiKey"];
const apiSecret = config.apiSecret || shop.apiSecret || shop["shopifyConfig.apiSecret"];
const accessToken = config.accessToken || shop.accessToken || shop["shopifyConfig.accessToken"];

if (!apiKey || !apiSecret || !accessToken) {
  // Affiche la modale "Ajouter les clés API"
  promptApiKeys(shop);
}
```

### 2. Modale d'ajout des clés API

Si des credentials manquent, une modale s'affiche avec :

- **Tutoriel détaillé** : Comment créer une app personnalisée Shopify
- **Trois champs** : API Key, API Secret Key, Access Token
- **Lien direct** : Vers l'admin de la boutique
- **Sauvegarde automatique** : Via `PUT /api/internal/clients/:clientId/shops/:shopId`

### 3. Publication automatique post-sauvegarde

Après sauvegarde des credentials, la publication se lance automatiquement.

## Tests et debugging

### 1. Logs côté serveur

```bash
# Vérification des credentials
[API] Publishing 2 products to Shopify for shop Achraf

# Création produit
[Shopify] Processing product: Waffle
[Shopify] Creating product with input: {...}
[Shopify] Product created successfully with ID: gid://shopify/Product/123

# Création variante  
[Shopify] Creating variant with input: {...}
[Shopify] Product "Waffle" successfully created and configured

# Mise à jour stock
[Shopify] Updating inventory for item gid://shopify/InventoryItem/123 with quantity 25
```

### 2. Logs côté client

```bash
# Publication
[Frontend] Publishing 2 products for shop Achraf

# Résultats détaillés
✅ Waffle: Created with ID gid://shopify/Product/123456789
❌ Croissant: SKU already exists
```

### 3. Tests manuels avec curl

```bash
# Test publication
curl -X PUT http://localhost:5000/api/internal/shopify/shop/684132fc1d50f97b8db1e39c/publish-products \
  -H "Content-Type: application/json" \
  -d '{
    "productIds": ["686506390e6dd5ae60fc481e"]
  }'

# Test validation credentials
curl -X GET http://localhost:5000/api/internal/shops/684132fc1d50f97b8db1e39c
```

## Erreurs communes et solutions

### 1. "Field is not defined on ProductVariantsBulkInput"

**Cause :** Utilisation de champs dépréciés (sku, weight, inventoryQuantity directement)  
**Solution :** Utiliser `inventoryItem: { sku, weight, weightUnit }` et `inventoryAdjustQuantities` séparément

### 2. "The variant 'Default Title' already exists"

**Cause :** Tentative de création d'une variante sur un produit qui en a déjà une  
**Solution :** Utiliser `REMOVE_STANDALONE_VARIANT` strategy

### 3. "Missing Shopify credentials"

**Cause :** Credentials non configurés ou mal structurés  
**Solution :** Vérifier la présence des 3 champs requis dans `shopifyConfig`

### 4. "Access denied"

**Cause :** Token incorrect ou permissions insuffisantes  
**Solution :** Régénérer le token avec les scopes `write_products` et `write_inventory`

### 5. Problèmes de stock

**Cause :** `inventoryItemId` manquant ou permissions inventory insuffisantes  
**Solution :** Vérifier que la variante retourne `inventoryItem.id` et que l'app a `write_inventory`

## Limitations et considérations

### 1. Produits simples uniquement

Cette implémentation crée des produits avec une seule variante. Pour des produits avec plusieurs variantes (tailles, couleurs), une logique supplémentaire serait nécessaire.

### 2. Gestion du stock

Le stock est défini à la création mais n'est pas mis à jour automatiquement. Pour une synchronisation bidirectionnelle, implémenter des webhooks Shopify.

### 3. Images

Les images ne sont pas gérées dans cette version. Pour ajouter des images :

1. Utiliser `fileCreate` pour uploader
2. Ajouter les `mediaIds` dans `ProductInput`

### 4. Rate limiting

L'API Shopify a des limites de taux. Pour de gros volumes, implémenter :

- Retry avec backoff exponentiel
- Bulk operations pour >1000 produits
- Queuing système pour traitement asynchrone

### 5. Séparation des mutations

Avec l'API 2025-07, la création, les variants et l'inventaire sont séparés :
- Étape 1 : Produit uniquement
- Étape 2 : Variante avec prix/SKU/poids  
- Étape 3 : Inventaire séparément

## Évolutions futures

1. **Support multi-variantes** : Produits avec tailles/couleurs
2. **Synchronisation stock** : Mise à jour bidirectionnelle via webhooks
3. **Gestion images** : Upload et association automatique
4. **Bulk operations** : Pour catalogues volumineux
5. **Retry logic** : Gestion robuste des erreurs temporaires
6. **Publication automatique** : Appel à `publishablePublishToCurrentChannel` post-création 

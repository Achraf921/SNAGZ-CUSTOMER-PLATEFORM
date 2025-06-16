import React, { useState, useEffect } from 'react';
import { FaEdit, FaSave, FaTimes } from 'react-icons/fa';

const ShopDetails = ({ clientId, shopId }) => {
  const [shop, setShop] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [fieldValues, setFieldValues] = useState({});

  useEffect(() => {
    const fetchShopDetails = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/internal/clients/${clientId}/shops/${shopId}`);
        
        if (!response.ok) throw new Error('Failed to fetch shop details');
        
        const data = await response.json();
        const shopData = data.shop || data; // Handle both response formats
        console.log('Shop data:', shopData);
        
        if (!shopData || typeof shopData !== 'object') {
          throw new Error('Invalid shop data format');
        }
        
        setShop(shopData);
        setError(null);
      } catch (err) {
        console.error('Error details:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchShopDetails();
  }, [clientId, shopId]);

  const getFieldValue = (field) => {
    const value = shop[field.key];
    if (value === undefined || value === null) return 'Non spécifié';
    if (field.type === 'date' && value) return new Date(value).toLocaleDateString();
    if (field.type === 'checkbox') return value ? field.trueLabel : field.falseLabel;
    if (field.type === 'input') return value;
    return value;
  };

  const handleEdit = (field) => {
    setEditingField(field.key);
    setFieldValues({...fieldValues, [field.key]: shop[field.key]});
  };

  const handleSave = async (field) => {
    try {
      const response = await fetch(`/api/internal/clients/${clientId}/shops/${shopId}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({[field.key]: fieldValues[field.key]})
      });
      
      if (!response.ok) throw new Error('Failed to update shop');
      
      const updatedData = await response.json();
      const updatedShop = updatedData.shop || updatedData;
      setShop(updatedShop);
      setEditingField(null);
    } catch (err) {
      console.error('Error updating field:', err);
      setError(err.message);
    }
  };

  const handleCancel = () => {
    setEditingField(null);
  };

  const handleChange = (field, value) => {
    setFieldValues({...fieldValues, [field.key]: value});
  };

  if (isLoading) return <p>Chargement des détails de la boutique...</p>;
  if (error) return <p>Erreur: {error}</p>;
  if (!shop) return <p>Boutique non trouvée.</p>;

  console.log('Shop data in state:', shop);

  const displayFields = [
    { key: 'nomProjet', label: 'Nom Projet', type: 'text' },
    { key: 'typeProjet', label: 'Type Projet', type: 'text' },
    { key: 'commercial', label: 'Commercial', type: 'text' },
    { 
      key: 'estBoutiqueEnLigne', 
      label: 'Est Boutique En Ligne',
      type: 'checkbox',
      trueLabel: 'Oui',
      falseLabel: 'Non'
    },
    { key: 'status', label: 'Statut', type: 'text' },
    { key: 'clientName', label: 'Client', type: 'text' },
    { 
      key: 'createdAt', 
      label: 'Date de Création',
      type: 'date'
    },
    { key: 'nomClient', label: 'Nom Client' },
    { key: 'contactsClient', label: 'Contacts Client' },
    { key: 'compteClientRef', label: 'Compte Client Ref' },
    { key: 'dateMiseEnLigne', label: 'Date Mise En Ligne', type: 'date' },
    { key: 'dateCommercialisation', label: 'Date Commercialisation', type: 'date' },
    { key: 'dateSortieOfficielle', label: 'Date Sortie Officielle', type: 'date' },
    { 
      key: 'precommande', 
      label: 'Precommande',
      type: 'checkbox',
      trueLabel: 'Oui',
      falseLabel: 'Non'
    },
    { 
      key: 'dedicaceEnvisagee', 
      label: 'Dedicace Envisagee',
      type: 'checkbox',
      trueLabel: 'Oui',
      falseLabel: 'Non'
    },
    { 
      key: 'typeAbonnementShopify', 
      label: 'Type Abonnement Shopify',
      type: 'select',
      options: ['annuel', 'mensuel', 'aucun']
    },
    { key: 'snaResponsableDesign', label: 'Sna Responsable Design' },
    { 
      key: 'moduleDelivengo', 
      label: 'Module Delivengo',
      type: 'checkbox',
      trueLabel: 'Oui',
      falseLabel: 'Non'
    },
    { 
      key: 'moduleMondialRelay', 
      label: 'Module Mondial Relay',
      type: 'checkbox',
      trueLabel: 'Oui',
      falseLabel: 'Non'
    }
  ];

  return (
    <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
      <h2 className="text-xl font-bold mb-4">Détails de la Boutique</h2>
      {displayFields.map((field) => (
        <div key={field.key} className="flex items-center gap-2">
          <span className="font-medium w-48">{field.label}:</span>
          
          {editingField === field.key ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                className="px-3 py-1 border rounded flex-1"
                type={field.type === 'date' ? 'date' : 'text'}
                value={fieldValues[field.key] || ''}
                onChange={(e) => handleChange(field, e.target.value)}
              />
              <button 
                className="p-1 text-green-600 hover:text-green-800"
                onClick={() => handleSave(field)}
              >
                <FaSave />
              </button>
              <button 
                className="p-1 text-red-600 hover:text-red-800"
                onClick={handleCancel}
              >
                <FaTimes />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-1">
              <span className="px-3 py-1 bg-gray-100 rounded flex-1">
                {getFieldValue(field)}
              </span>
              <button 
                className="p-1 text-blue-600 hover:text-blue-800"
                onClick={() => handleEdit(field)}
              >
                <FaEdit />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ShopDetails;

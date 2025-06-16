import { useState } from 'react';
import toast from 'react-hot-toast';

const initialState = {
  // Infos Projet
  nomProjet: '',
  typeProjet: '',
  commercial: '',
  urlBoutique: '',
  
  // Infos Client
  nomClient: '',
  emailClient: '',
  telephoneClient: '',
  compteClient: '',
  
  // Paramètres et Facturation
  dateMiseEnLigne: '',
  dateCommercialisation: '',
  dateSortieOfficielle: '',
  precommande: false,
  dedicace: '',
  facturation: '',
  abonnementMensuelShopify: 0,
  abonnementAnnuelShopify: 0,
  coutsMondialRelay: 0,
  fraisMaintenance: 0,
  fraisOuvertureBoutique: 0,
  fraisOuvertureSansHabillage: 0,
  commissionSNAGZ: 0,
  
  // Assets Branding
  logo: null,
  banniereDesktop: null,
  banniereMobile: null,
  favicon: null,
  charteGraphique: null,
  texteCTA: '',
  policeTitres: '',
  policeTextes: '',
  descriptionsArticles: [''],
  messageSAV: '',
  
  // Réseaux Sociaux
  reseauxSociaux: ['']
};

export const useShopForm = () => {
  const [formData, setFormData] = useState(initialState);
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const handleChange = (e) => {
    const { name, value, type, checked, files } = e.target;
    
    if (type === 'file' && files) {
      setFormData(prev => ({
        ...prev,
        [name]: files[0]
      }));
    } else if (type === 'checkbox') {
      setFormData(prev => ({
        ...prev,
        [name]: checked
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };
  
  const handleArrayChange = (index, value, field) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].map((item, i) => i === index ? value : item)
    }));
  };
  
  const addArrayItem = (field) => {
    setFormData(prev => ({
      ...prev,
      [field]: [...prev[field], '']
    }));
  };
  
  const removeArrayItem = (index, field) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index)
    }));
  };
  
  const nextStep = () => {
    setCurrentStep(prev => Math.min(prev + 1, 5));
  };
  
  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const formDataToSend = new FormData();
      
      // Append all text fields
      Object.entries(formData).forEach(([key, value]) => {
        if (value instanceof File) {
          formDataToSend.append(key, value);
        } else if (Array.isArray(value)) {
          formDataToSend.append(key, JSON.stringify(value));
        } else {
          formDataToSend.append(key, String(value));
        }
      });
      
      const response = await fetch('/api/shops', {
        method: 'POST',
        body: formDataToSend,
      });
      
      if (!response.ok) {
        throw new Error('Erreur lors de la soumission du formulaire');
      }
      
      toast.success('Boutique créée avec succès !');
      setFormData(initialState);
      setCurrentStep(1);
    } catch (error) {
      toast.error(error.message || 'Une erreur est survenue');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return {
    formData,
    currentStep,
    isSubmitting,
    handleChange,
    handleArrayChange,
    addArrayItem,
    removeArrayItem,
    nextStep,
    prevStep,
    handleSubmit,
  };
}; 
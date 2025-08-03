import React from 'react';

const CorruptedFileModal = ({ isOpen, onClose, fileName }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl">
        <div className="flex items-center mb-4">
          <div className="flex-shrink-0">
            <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-lg font-medium text-gray-900">
              Fichier corrompu détecté
            </h3>
          </div>
        </div>
        
        <div className="mb-6">
          <p className="text-sm text-gray-600 mb-3">
            Le fichier <strong>"{fileName}"</strong> semble être corrompu ou endommagé et ne peut pas être utilisé.
          </p>
          
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h4 className="text-sm font-medium text-blue-800">
                  Solutions recommandées :
                </h4>
                <div className="mt-2 text-sm text-blue-700">
                  <ul className="list-disc list-inside space-y-1">
                    <li>Essayez avec un autre fichier image</li>
                    <li>Re-téléchargez l'image depuis sa source originale</li>
                    <li>Ouvrez l'image dans une application (Photoshop, Preview, etc.) et sauvegardez-la à nouveau</li>
                    <li>Convertissez l'image dans un autre format (PNG, JPG)</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-sna-primary text-white text-sm font-medium rounded-md hover:bg-sna-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary"
          >
            Compris
          </button>
        </div>
      </div>
    </div>
  );
};

export default CorruptedFileModal;

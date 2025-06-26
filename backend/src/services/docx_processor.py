from docx import Document
from docx.shared import Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.style import WD_STYLE_TYPE
import json
import sys
import os
import base64
import datetime

# Set up logging to a file
def setup_logging():
    log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs')
    os.makedirs(log_dir, exist_ok=True)
    log_file = os.path.join(log_dir, f'docx_processor_{datetime.datetime.now().strftime("%Y%m%d_%H%M%S")}.log')
    
    def log_message(message):
        with open(log_file, 'a', encoding='utf-8') as f:
            timestamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            f.write(f'[{timestamp}] {message}\n')
            print(f'[{timestamp}] {message}')
    
    return log_message

log = setup_logging()


def replace_placeholders_and_format(docx_path, shop_data, output_path):
    log(f"Starting document processing for: {docx_path}")
    log(f"Output will be saved to: {output_path}")
    
    try:
        document = Document(docx_path)
        log(f"Successfully loaded document: {docx_path}")
    except Exception as e:
        log(f"Failed to load document: {str(e)}")
        raise

    log(f"[DEBUG - Inside replace_placeholders_and_format] Type of shop_data: {type(shop_data)}")
    log(f"[DEBUG - Inside replace_placeholders_and_format] Content of shop_data: {shop_data}")
    
    # Ensure shop_data is a dictionary
    if not isinstance(shop_data, dict):
        error_msg = f"[ERROR] shop_data is not a dictionary. Type: {type(shop_data)}, Value: {shop_data}"
        log(error_msg)
        raise ValueError(error_msg)

    # Define the mapping from XXXn to shop_data keys
    # IMPORTANT: Adjust these keys to match your actual shop document structure
    # Get the raisonSociale from the customer data (passed in shop_data)
    raison_sociale = shop_data.get("raisonSociale", "") or shop_data.get("clientName", "").split('_')[0]
    
    # Get boolean values from shop_data and convert to OUI/NON
    precommande_value = "OUI" if shop_data.get("precommande", False) else "NON"
    dedicace_value = "OUI" if shop_data.get("dedicaceEnvisagee", False) else "NON"
    
    placeholder_mapping = {
        "XXX1": shop_data.get("nomProjet", ""),  # Project name
        "XXX2": shop_data.get("typeProjet", ""),  # Project type
        "XXX3": shop_data.get("commercial", ""),  # Commercial name
        "XXX4": raison_sociale,  # Client's raison sociale
        "XXX5": shop_data.get("compteClientRef", ""),  # Client reference
        "XXX6": shop_data.get("contactsClient", ""),  # Client contact email
        "XXX7": shop_data.get("dateMiseEnLigne", ""),  # Go-live date
        "XXX8": shop_data.get("dateCommercialisation", ""),  # Commercialization date
        "XXX9": shop_data.get("dateSortieOfficielle", ""),  # Official release date
        "XXX10": precommande_value,  # Pre-order (OUI/NON)
        "XXX11": dedicace_value,  # Dedication planned (OUI/NON)
        "XXX12": shop_data.get("boutiqueEnLigne", ""),  # Boutique en ligne (OUI/NON)
        "XXX13": shop_data.get("chefProjet", ""),  # Chef de projet (prenom + nom)
        "XXX14": shop_data.get("dateDemarageProjet", ""),  # Date démarrage projet
        "COMPTENUM": shop_data.get("compteClientRef", ""),  # Client reference number
    }

    # Define the contract D2C fields and their corresponding shop_data keys (boolean)
    # If the shop_data key is False (not selected), the corresponding text will be strikethrough.
    # IMPORTANT: The 'text' here MUST EXACTLY match the text in your DOCX file for strikethrough.
    # You will need to ensure these 'condition_key' values match the boolean fields in your shop_data.
    contract_d2c_strikethrough_rules = [
        {"text": "Abonnement mensurel SHOPIFY (12 mois) 948 euro", "condition_key": "shopifyPlanMonthlySelected"},
        {"text": "Abonnement annuel SHOPIFY (12 mois) 948 euro", "condition_key": "shopifyPlanYearlySelected"},
        # Add other contract D2C fields here as needed
        # {"text": "Specific text for Option A", "condition_key": "optionA_selected"},
    ]

    for paragraph in document.paragraphs:
        # Placeholder replacement
        for key, value in placeholder_mapping.items():
            if key in paragraph.text:
                paragraph.text = paragraph.text.replace(key, str(value))
        
        # Strikethrough application
        for rule in contract_d2c_strikethrough_rules:
            contract_text = rule["text"]
            condition_key = rule["condition_key"]
            is_selected = shop_data.get(condition_key, False) # Default to False if key not present

            if not is_selected and contract_text in paragraph.text:
                # This is a simple approach. If the text is broken across multiple runs
                # or interspersed with other formatting, this might not work perfectly.
                # It will apply strikethrough to any run containing the full contract_text.
                for run in paragraph.runs:
                    if contract_text in run.text:
                        run.font.strike = True
    
    # Process tables for placeholders and strikethrough (if applicable)
    for table in document.tables:
        for row in table.rows:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    # Placeholder replacement in table cells
                    for key, value in placeholder_mapping.items():
                        if key in paragraph.text:
                            paragraph.text = paragraph.text.replace(key, str(value))
                    
                    # Strikethrough application in table cells
                    for rule in contract_d2c_strikethrough_rules:
                        contract_text = rule["text"]
                        condition_key = rule["condition_key"]
                        is_selected = shop_data.get(condition_key, False)

                        if not is_selected and contract_text in paragraph.text:
                            for run in paragraph.runs:
                                if contract_text in run.text:
                                    run.font.strike = True

    document.save(output_path)
    print(f"Document saved to {output_path}")

if __name__ == "__main__":
    try:
        log("Script started")
        
        if len(sys.argv) != 4:
            error_msg = "Usage: python docx_processor.py <docx_template_path> <shop_data_json_string> <output_docx_path>"
            log(error_msg)
            print(error_msg, file=sys.stderr)
            sys.exit(1)

        template_path = sys.argv[1]
        encoded_shop_data_string = sys.argv[2]
        output_path = sys.argv[3]

        log(f"Template path: {template_path}")
        log(f"Output path: {output_path}")
        log(f"Encoded data length: {len(encoded_shop_data_string)} characters")

        try:
            # Decode the Base64 string back to JSON
            log("Decoding base64 data...")
            shop_data_string = base64.b64decode(encoded_shop_data_string).decode('utf-8')
            log("Successfully decoded base64 data")
            
            log(f"[DEBUG] Type of shop_data_string after decode: {type(shop_data_string)}")
            log(f"[DEBUG] First 100 chars of shop_data_string: {shop_data_string[:100]}...")

            # Parse the JSON string
            log("Parsing JSON data...")
            shop_data = json.loads(shop_data_string)
            log("Successfully parsed JSON data")
            
            log(f"[DEBUG] Type of shop_data after json.loads: {type(shop_data)}")
            log(f"[DEBUG] shop_data keys: {list(shop_data.keys())}")

            # Process the document
            log("Starting document processing...")
            replace_placeholders_and_format(template_path, shop_data, output_path)
            log("Document processing completed successfully")
            
        except Exception as e:
            error_msg = f"Error processing document: {str(e)}"
            log(error_msg)
            log(f"Error type: {type(e).__name__}")
            if hasattr(e, 'args'):
                log(f"Error args: {e.args}")
            raise
            
    except Exception as e:
        error_msg = f"Fatal error: {str(e)}"
        log(error_msg)
        print(error_msg, file=sys.stderr)
        sys.exit(1) 
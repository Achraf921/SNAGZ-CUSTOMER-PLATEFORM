const nodemailer = require('nodemailer');
const { logger } = require('../utils/secureLogger');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  async initializeTransporter() {
    try {
      // Check if we have SMTP configuration with your variable names
      if (process.env.EMAIL_SMTP_HOST && process.env.EMAIL_SMTP_PORT) {
        // Use SMTP configuration
        this.transporter = nodemailer.createTransport({
          host: process.env.EMAIL_SMTP_HOST,
          port: parseInt(process.env.EMAIL_SMTP_PORT),
          secure: process.env.EMAIL_SMTP_SECURE === 'true', // true for 465, false for other ports
          auth: {
            user: process.env.EMAIL_SMTP_USER,
            pass: process.env.EMAIL_SMTP_PASS
          },
          tls: {
            rejectUnauthorized: false // Allow self-signed certificates
          }
        });
        logger.debug('📧 SMTP email service configured successfully');
      } else if (process.env.SMTP_HOST && process.env.SMTP_PORT) {
        // Fallback to original variable names for backward compatibility
        this.transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT),
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          },
          tls: {
            rejectUnauthorized: false
          }
        });
        logger.debug('📧 SMTP email service configured (legacy variables)');
      } else if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
        // Use Gmail configuration
        this.transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD
          }
        });
      } else {
        // Use development configuration - create test account dynamically
        logger.debug('📧 No email configuration found, setting up development mode...');
        
        try {
          // Create a test account dynamically
          const testAccount = await nodemailer.createTestAccount();
          
          this.transporter = nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false,
            auth: {
              user: testAccount.user,
              pass: testAccount.pass
            }
          });
          
          logger.debug('📧 Development email account created:', testAccount.user);
        } catch (etherealError) {
          logger.debug('⚠️ Ethereal email setup failed, using mock transporter for development');
          
          // Create a mock transporter that logs instead of sending
          this.transporter = {
            sendMail: async (mailOptions) => {
              logger.debug('📧 [MOCK EMAIL] Would send email:');
              logger.debug('📧 From:', mailOptions.from);
              logger.debug('📧 To:', mailOptions.to);
              logger.debug('📧 Subject:', mailOptions.subject);
              logger.debug('📧 Content preview:', mailOptions.text?.substring(0, 100) + '...');
              
              return {
                messageId: `mock-${Date.now()}@localhost`,
                response: 'Mock email sent successfully'
              };
            },
            verify: async () => true
          };
        }
      }

      // Verify transporter configuration
      await this.transporter.verify();
      logger.debug('✅ Email service initialized successfully');
    } catch (error) {
      logger.error('❌ Email service initialization failed:', error);
      this.transporter = null;
    }
  }

  async sendWelcomeEmail(email, name, temporaryPassword) {
    try {
      if (!this.transporter) {
        logger.debug('📧 Email service not ready, attempting re-initialization...');
        await this.initializeTransporter();
        if (!this.transporter) {
          throw new Error('Email service not initialized');
        }
      }

      const subject = 'Bienvenue chez SNA GZ - Vos identifiants de connexion';
      
            const htmlContent = `
        <!DOCTYPE html>
        <html lang="fr">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Bienvenue chez SNA GZ</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
              line-height: 1.6; 
              color: #374151; 
              background-color: #f3f4f6;
            }
            .email-wrapper { 
              background-color: #f3f4f6; 
              padding: 40px 20px; 
              min-height: 100vh; 
            }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              background-color: #ffffff; 
              border-radius: 12px; 
              box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1); 
              overflow: hidden;
            }
            .header { 
              background: linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%); 
              color: white; 
              padding: 40px 30px; 
              text-align: center; 
            }
            .header h1 { 
              font-size: 28px; 
              font-weight: 700; 
              margin-bottom: 8px; 
              letter-spacing: -0.5px;
              color: white !important;
              text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
            }
            .header p { 
              font-size: 16px; 
              opacity: 0.95; 
              font-weight: 400;
              color: white !important;
              text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
            }
            .content { 
              padding: 40px 30px; 
            }
            .greeting { 
              font-size: 18px; 
              color: #1f2937; 
              margin-bottom: 24px; 
              font-weight: 600;
            }
            .message { 
              font-size: 16px; 
              margin-bottom: 24px; 
              color: #4b5563;
            }
            .credentials { 
              background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); 
              padding: 24px; 
              border-radius: 8px; 
              margin: 32px 0; 
              border-left: 4px solid #3b82f6;
            }
            .credentials h3 { 
              color: #1e40af; 
              font-size: 18px; 
              margin-bottom: 16px; 
              font-weight: 600;
            }
            .credential-item { 
              background-color: white; 
              padding: 12px 16px; 
              margin: 8px 0; 
              border-radius: 6px; 
              border: 1px solid #e5e7eb;
            }
            .credential-label { 
              font-weight: 600; 
              color: #374151; 
              font-size: 14px; 
              text-transform: uppercase; 
              letter-spacing: 0.5px;
            }
            .credential-value { 
              font-size: 16px; 
              color: #1f2937; 
              font-weight: 500; 
              margin-top: 4px;
            }
            .warning { 
              background-color: #fef3c7; 
              border-left: 4px solid #f59e0b; 
              padding: 16px; 
              margin: 24px 0; 
              border-radius: 6px;
            }
            .warning p { 
              color: #92400e; 
              font-weight: 500; 
              font-size: 14px;
            }
            .features { 
              margin: 32px 0;
            }
            .features h3 { 
              color: #1f2937; 
              font-size: 18px; 
              margin-bottom: 16px; 
              font-weight: 600;
            }
            .features ul { 
              list-style: none; 
              padding: 0;
            }
            .features li { 
              padding: 8px 0; 
              color: #4b5563; 
              position: relative; 
              padding-left: 24px;
            }
            .features li:before { 
              content: "✓"; 
              color: #10b981; 
              font-weight: bold; 
              position: absolute; 
              left: 0;
            }
            .button-container { 
              text-align: center; 
              margin: 40px 0;
            }
            .button { 
              display: inline-block; 
              padding: 16px 32px; 
              background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); 
              color: white; 
              text-decoration: none; 
              border-radius: 8px; 
              font-weight: 600; 
              font-size: 16px; 
              transition: all 0.3s ease;
              box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
            }
            .button:hover { 
              transform: translateY(-2px); 
              box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
            }
            .support { 
              margin-top: 32px; 
              padding-top: 24px; 
              border-top: 1px solid #e5e7eb;
            }
            .signature { 
              margin-top: 32px; 
              color: #4b5563; 
              font-style: italic;
            }
            .footer { 
              background-color: #f9fafb; 
              text-align: center; 
              padding: 24px 30px; 
              border-top: 1px solid #e5e7eb;
            }
            .footer p { 
              color: #6b7280; 
              font-size: 12px; 
              margin: 4px 0;
            }
            .footer .company { 
              font-weight: 600; 
              color: #374151;
            }
            @media (max-width: 600px) {
              .email-wrapper { padding: 20px 10px; }
              .header { padding: 30px 20px; }
              .content { padding: 30px 20px; }
              .header h1 { font-size: 24px; }
              .button { padding: 14px 28px; font-size: 14px; }
            }
          </style>
        </head>
        <body>
          <div class="email-wrapper">
            <div class="container">
              <div class="header">
                <h1>🎉 Bienvenue chez SNA GZ</h1>
                <p>Votre portail de création de boutiques en ligne</p>
              </div>
              <div class="content">
                <div class="greeting">Bonjour ${name},</div>
                
                <div class="message">
                  Nous sommes ravis de vous accueillir dans la famille SNA GZ ! Votre compte a été créé avec succès et vous pouvez maintenant accéder à toutes nos fonctionnalités.
                </div>
                
                <div class="credentials">
                  <h3>🔐 Vos identifiants de connexion</h3>
                  <div class="credential-item">
                    <div class="credential-label">Adresse email</div>
                    <div class="credential-value">${email}</div>
                  </div>
                  <div class="credential-item">
                    <div class="credential-label">Mot de passe temporaire</div>
                    <div class="credential-value">${temporaryPassword}</div>
                  </div>
                </div>
                
                <div class="warning">
                  <p><strong>🔒 Sécurité :</strong> Vous devrez changer votre mot de passe lors de votre première connexion pour sécuriser votre compte.</p>
                </div>
                
                <div class="features">
                  <h3>🚀 Découvrez ce que vous pouvez faire</h3>
                  <ul>
                    <li>Créer et personnaliser vos boutiques en ligne</li>
                    <li>Gérer votre catalogue de produits</li>
                    <li>Suivre l'avancement de vos projets</li>
                    <li>Accéder à la documentation complète</li>
                    <li>Bénéficier de notre support technique</li>
                  </ul>
                </div>
                
                <div class="button-container">
                  <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/client/login" class="button">
                    Accéder à mon espace client
                  </a>
                </div>
                
                <div class="support">
                  <div class="message">
                    Une question ? Notre équipe est là pour vous accompagner dans cette nouvelle aventure !
                  </div>
                </div>
                
                <div class="signature">
                  Cordialement,<br>
                  <strong>L'équipe SNA GZ</strong>
                </div>
              </div>
              <div class="footer">
                <p>Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
                <p class="company">SNA GZ - Solutions E-commerce Innovantes</p>
              </div>
            </div>
          </div>
        </body>
        </html>
`;

      const textContent = `
        🎉 Bienvenue chez SNA GZ - Votre portail de création de boutiques en ligne
        
        Bonjour ${name},
        
        Nous sommes ravis de vous accueillir dans la famille SNA GZ ! Votre compte a été créé avec succès et vous pouvez maintenant accéder à toutes nos fonctionnalités.
        
        🔐 VOS IDENTIFIANTS DE CONNEXION :
        ================================
        Adresse email : ${email}
        Mot de passe temporaire : ${temporaryPassword}
        
        🔒 SÉCURITÉ :
        Vous devrez changer votre mot de passe lors de votre première connexion pour sécuriser votre compte.
        
        🚀 DÉCOUVREZ CE QUE VOUS POUVEZ FAIRE :
        • Créer et personnaliser vos boutiques en ligne
        • Gérer votre catalogue de produits
        • Suivre l'avancement de vos projets
        • Accéder à la documentation complète
        • Bénéficier de notre support technique
        
        ACCÉDER À VOTRE ESPACE CLIENT :
        ${process.env.FRONTEND_URL || 'http://localhost:3000'}/client/login
        
        Une question ? Notre équipe est là pour vous accompagner dans cette nouvelle aventure !
        
        Cordialement,
        L'équipe SNA GZ - Solutions E-commerce Innovantes
        
        ---
        Cet email a été envoyé automatiquement, merci de ne pas y répondre.
      `;

      const mailOptions = {
        from: process.env.EMAIL_FROM_NAME 
          ? `${process.env.EMAIL_FROM_NAME} <${process.env.EMAIL_FROM_ADDRESS || 'noreply@snagz.com'}>`
          : process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_FROM || 'noreply@snagz.com',
        to: email,
        subject: subject,
        text: textContent,
        html: htmlContent
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      // Email logging removed for security

      return {
        success: true,
        recipient: email,
        messageId: result.messageId,
        mode: process.env.NODE_ENV || 'development'
      };

    } catch (error) {
      logger.error('❌ Failed to send welcome email:', error);
      return {
        success: false,
        error: error.message,
        recipient: email
      };
    }
  }

  async sendPasswordResetEmail(email, name, resetUrl) {
    try {
      if (!this.transporter) {
        logger.debug('📧 Email service not ready, attempting re-initialization...');
        await this.initializeTransporter();
        if (!this.transporter) {
          throw new Error('Email service not initialized');
        }
      }

      const subject = 'Réinitialisation de mot de passe - SNA GZ';
      
            const htmlContent = `
        <!DOCTYPE html>
        <html lang="fr">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Réinitialisation de mot de passe</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
              line-height: 1.6; 
              color: #374151; 
              background-color: #f3f4f6;
            }
            .email-wrapper { 
              background-color: #f3f4f6; 
              padding: 40px 20px; 
              min-height: 100vh; 
            }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              background-color: #ffffff; 
              border-radius: 12px; 
              box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1); 
              overflow: hidden;
            }
            .header { 
              background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); 
              color: white; 
              padding: 40px 30px; 
              text-align: center; 
            }
            .header h1 { 
              font-size: 28px; 
              font-weight: 700; 
              margin-bottom: 8px; 
              letter-spacing: -0.5px;
            }
            .header p { 
              font-size: 16px; 
              opacity: 0.9; 
              font-weight: 300;
            }
            .content { 
              padding: 40px 30px; 
            }
            .greeting { 
              font-size: 18px; 
              color: #1f2937; 
              margin-bottom: 24px; 
              font-weight: 600;
            }
            .message { 
              font-size: 16px; 
              margin-bottom: 24px; 
              color: #4b5563;
            }
            .button-container { 
              text-align: center; 
              margin: 40px 0;
            }
            .button { 
              display: inline-block; 
              padding: 16px 32px; 
              background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); 
              color: white; 
              text-decoration: none; 
              border-radius: 8px; 
              font-weight: 600; 
              font-size: 16px; 
              transition: all 0.3s ease;
              box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);
            }
            .button:hover { 
              transform: translateY(-2px); 
              box-shadow: 0 6px 20px rgba(220, 38, 38, 0.4);
            }
            .warning { 
              background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); 
              border-left: 4px solid #f59e0b; 
              padding: 24px; 
              margin: 32px 0; 
              border-radius: 8px;
            }
            .warning h3 { 
              color: #92400e; 
              font-size: 18px; 
              margin-bottom: 16px; 
              font-weight: 600;
            }
            .warning ul { 
              list-style: none; 
              padding: 0; 
              margin: 0;
            }
            .warning li { 
              padding: 6px 0; 
              color: #92400e; 
              position: relative; 
              padding-left: 24px; 
              font-weight: 500;
            }
            .warning li:before { 
              content: "⚠️"; 
              position: absolute; 
              left: 0; 
              top: 6px;
            }
            .link-section { 
              background-color: #f9fafb; 
              padding: 20px; 
              border-radius: 8px; 
              margin: 24px 0; 
              border: 1px solid #e5e7eb;
            }
            .link-section h4 { 
              color: #374151; 
              font-size: 16px; 
              margin-bottom: 12px; 
              font-weight: 600;
            }
            .link-text { 
              word-break: break-all; 
              color: #3b82f6; 
              font-size: 14px; 
              background-color: white; 
              padding: 12px; 
              border-radius: 6px; 
              border: 1px solid #d1d5db; 
              font-family: monospace;
            }
            .support { 
              margin-top: 32px; 
              padding-top: 24px; 
              border-top: 1px solid #e5e7eb;
            }
            .signature { 
              margin-top: 32px; 
              color: #4b5563; 
              font-style: italic;
            }
            .footer { 
              background-color: #f9fafb; 
              text-align: center; 
              padding: 24px 30px; 
              border-top: 1px solid #e5e7eb;
            }
            .footer p { 
              color: #6b7280; 
              font-size: 12px; 
              margin: 4px 0;
            }
            .footer .company { 
              font-weight: 600; 
              color: #374151;
            }
            .security-note { 
              background-color: #dbeafe; 
              border-left: 4px solid #3b82f6; 
              padding: 16px; 
              margin: 24px 0; 
              border-radius: 6px;
            }
            .security-note p { 
              color: #1e40af; 
              font-weight: 500; 
              font-size: 14px;
            }
            @media (max-width: 600px) {
              .email-wrapper { padding: 20px 10px; }
              .header { padding: 30px 20px; }
              .content { padding: 30px 20px; }
              .header h1 { font-size: 24px; }
              .button { padding: 14px 28px; font-size: 14px; }
            }
          </style>
        </head>
        <body>
          <div class="email-wrapper">
            <div class="container">
              <div class="header">
                <h1>🔐 Réinitialisation de mot de passe</h1>
                <p>Sécurisez votre compte SNA GZ</p>
              </div>
              <div class="content">
                <div class="greeting">Bonjour ${name},</div>
                
                <div class="message">
                  Nous avons reçu une demande de réinitialisation de mot de passe pour votre compte SNA GZ. Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe sécurisé.
                </div>
                
                <div class="button-container">
                  <a href="${resetUrl}" class="button">
                    Réinitialiser mon mot de passe
                  </a>
                </div>
                
                <div class="warning">
                  <h3>⚠️ Informations importantes</h3>
                  <ul>
                    <li>Ce lien est valable pendant <strong>1 heure uniquement</strong></li>
                    <li>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email</li>
                    <li>Ne partagez jamais ce lien avec quelqu'un d'autre</li>
                    <li>Après utilisation, ce lien sera automatiquement désactivé</li>
                  </ul>
                </div>
                
                <div class="security-note">
                  <p><strong>🛡️ Conseil de sécurité :</strong> Choisissez un mot de passe fort contenant au moins 8 caractères, incluant des majuscules, des minuscules, des chiffres et des caractères spéciaux.</p>
                </div>
                
                <div class="link-section">
                  <h4>Le bouton ne fonctionne pas ?</h4>
                  <p style="margin-bottom: 8px; font-size: 14px; color: #6b7280;">Copiez et collez ce lien dans votre navigateur :</p>
                  <div class="link-text">${resetUrl}</div>
                </div>
                
                <div class="support">
                  <div class="message">
                    Si vous n'avez pas demandé cette réinitialisation ou si vous rencontrez des difficultés, contactez notre équipe support.
                  </div>
                </div>
                
                <div class="signature">
                  Cordialement,<br>
                  <strong>L'équipe SNA GZ</strong>
                </div>
              </div>
              <div class="footer">
                <p>Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
                <p class="company">SNA GZ - Solutions E-commerce Innovantes</p>
              </div>
            </div>
          </div>
        </body>
        </html>
`;

      const textContent = `
        🔐 Réinitialisation de mot de passe - SNA GZ
        
        Bonjour ${name},
        
        Nous avons reçu une demande de réinitialisation de mot de passe pour votre compte SNA GZ. Utilisez le lien ci-dessous pour créer un nouveau mot de passe sécurisé.
        
        LIEN DE RÉINITIALISATION :
        ${resetUrl}
        
        ⚠️ INFORMATIONS IMPORTANTES :
        • Ce lien est valable pendant 1 HEURE UNIQUEMENT
        • Si vous n'avez pas demandé cette réinitialisation, ignorez cet email
        • Ne partagez jamais ce lien avec quelqu'un d'autre
        • Après utilisation, ce lien sera automatiquement désactivé
        
        🛡️ CONSEIL DE SÉCURITÉ :
        Choisissez un mot de passe fort contenant au moins 8 caractères, incluant des majuscules, des minuscules, des chiffres et des caractères spéciaux.
        
        Si vous n'avez pas demandé cette réinitialisation ou si vous rencontrez des difficultés, contactez notre équipe support.
        
        Cordialement,
        L'équipe SNA GZ - Solutions E-commerce Innovantes
        
        ---
        Cet email a été envoyé automatiquement, merci de ne pas y répondre.
      `;

      const mailOptions = {
        from: process.env.EMAIL_FROM_NAME 
          ? `${process.env.EMAIL_FROM_NAME} <${process.env.EMAIL_FROM_ADDRESS || 'noreply@snagz.com'}>`
          : process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_FROM || 'noreply@snagz.com',
        to: email,
        subject: subject,
        text: textContent,
        html: htmlContent
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      // Email logging removed for security

      return {
        success: true,
        recipient: email,
        messageId: result.messageId,
        mode: process.env.NODE_ENV || 'development'
      };

    } catch (error) {
      logger.error('❌ Failed to send password reset email:', error);
      return {
        success: false,
        error: error.message,
        recipient: email
      };
    }
  }

  async sendNotificationEmail(email, name, subject, message) {
    try {
      if (!this.transporter) {
        logger.debug('📧 Email service not ready, attempting re-initialization...');
        await this.initializeTransporter();
        if (!this.transporter) {
          throw new Error('Email service not initialized');
        }
      }

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="fr">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${subject}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { 
              background-color: #0047AB; 
              color: white; 
              padding: 20px; 
              text-align: center; 
            }
            .header h1 { 
              color: white !important;
              text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
              font-weight: 700;
            }
            .content { padding: 20px; background-color: #f9f9f9; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>SNA GZ</h1>
            </div>
            <div class="content">
              <p>Bonjour ${name},</p>
              
              ${message}
              
              <p>Cordialement,<br>L'équipe SNA GZ</p>
            </div>
            <div class="footer">
              <p>Cet email a été envoyé automatiquement. Merci de ne pas y répondre.</p>
              <p>SNA GZ - Création de boutiques en ligne</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const mailOptions = {
        from: process.env.EMAIL_FROM_NAME 
          ? `${process.env.EMAIL_FROM_NAME} <${process.env.EMAIL_FROM_ADDRESS || 'noreply@snagz.com'}>`
          : process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_FROM || 'noreply@snagz.com',
        to: email,
        subject: subject,
        html: htmlContent
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      // Email logging removed for security

      return {
        success: true,
        recipient: email,
        messageId: result.messageId
      };

    } catch (error) {
      logger.error('❌ Failed to send notification email:', error);
      return {
        success: false,
        error: error.message,
        recipient: email
      };
    }
  }

  async sendAccountCreationEmail(email, name, temporaryPassword, accountType) {
    try {
      if (!this.transporter) {
        logger.debug('📧 Email service not ready, attempting re-initialization...');
        await this.initializeTransporter();
        if (!this.transporter) {
          throw new Error('Email service not initialized');
        }
      }

      // Define colors and content based on account type
      const accountConfig = {
        client: {
          primaryColor: '#3b82f6',
          secondaryColor: '#1d4ed8',
          gradientStart: '#1e40af',
          gradientEnd: '#1e3a8a',
          title: '🎉 Bienvenue chez SNA GZ',
          subtitle: 'Votre espace client est prêt',
          loginUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/client/login`,
          features: [
            'Créer et gérer vos boutiques en ligne',
            'Ajouter et organiser vos produits',
            'Suivre l\'avancement de vos projets',
            'Accéder à votre documentation personnalisée',
            'Bénéficier de notre support dédié'
          ]
        },
        internal: {
          primaryColor: '#10b981',
          secondaryColor: '#059669',
          gradientStart: '#047857',
          gradientEnd: '#065f46',
          title: '👨‍💼 Bienvenue dans l\'équipe SNA GZ',
          subtitle: 'Votre accès personnel interne est activé',
          loginUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/internal/login`,
          features: [
            'Gérer les clients et leurs projets',
            'Superviser les boutiques et produits',
            'Configurer les intégrations Shopify',
            'Accéder aux outils d\'administration',
            'Consulter les statistiques détaillées'
          ]
        },
        admin: {
          primaryColor: '#7c3aed',
          secondaryColor: '#5b21b6',
          gradientStart: '#5b21b6',
          gradientEnd: '#4c1d95',
          title: '⚡ Accès Administrateur SNA GZ',
          subtitle: 'Votre compte administrateur est configuré',
          loginUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/login`,
          features: [
            'Gestion complète des comptes utilisateurs',
            'Administration système et sécurité',
            'Configuration des paramètres globaux',
            'Supervision de toutes les opérations',
            'Accès aux rapports et analyses avancées'
          ]
        }
      };

      const config = accountConfig[accountType] || accountConfig.client;
      const subject = `Votre compte ${accountType === 'client' ? 'client' : accountType === 'internal' ? 'personnel' : 'administrateur'} SNA GZ est créé`;

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="fr">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Compte créé - SNA GZ</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
              line-height: 1.6; 
              color: #374151; 
              background-color: #f3f4f6;
            }
            .email-wrapper { 
              background-color: #f3f4f6; 
              padding: 40px 20px; 
              min-height: 100vh; 
            }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              background-color: #ffffff; 
              border-radius: 12px; 
              box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1); 
              overflow: hidden;
            }
            .header { 
              background: linear-gradient(135deg, ${config.gradientStart} 0%, ${config.gradientEnd} 100%); 
              color: white; 
              padding: 40px 30px; 
              text-align: center; 
            }
            .header h1 { 
              font-size: 28px; 
              font-weight: 700; 
              margin-bottom: 8px; 
              letter-spacing: -0.5px;
              color: white !important;
              text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
            }
            .header p { 
              font-size: 16px; 
              opacity: 0.95; 
              font-weight: 400;
              color: white !important;
              text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
            }
            .content { 
              padding: 40px 30px; 
            }
            .greeting { 
              font-size: 18px; 
              color: #1f2937; 
              margin-bottom: 24px; 
              font-weight: 600;
            }
            .message { 
              font-size: 16px; 
              margin-bottom: 24px; 
              color: #4b5563;
            }
            .credentials { 
              background: linear-gradient(135deg, ${config.primaryColor}15 0%, ${config.primaryColor}10 100%); 
              padding: 24px; 
              border-radius: 8px; 
              margin: 32px 0; 
              border-left: 4px solid ${config.primaryColor};
            }
            .credentials h3 { 
              color: ${config.primaryColor}; 
              font-size: 18px; 
              margin-bottom: 16px; 
              font-weight: 600;
            }
            .credential-item { 
              background-color: white; 
              padding: 12px 16px; 
              margin: 8px 0; 
              border-radius: 6px; 
              border: 1px solid #e5e7eb;
            }
            .credential-label { 
              font-weight: 600; 
              color: #374151; 
              font-size: 14px; 
              text-transform: uppercase; 
              letter-spacing: 0.5px;
            }
            .credential-value { 
              font-size: 16px; 
              color: #1f2937; 
              font-weight: 500; 
              margin-top: 4px;
            }
            .warning { 
              background-color: #fef3c7; 
              border-left: 4px solid #f59e0b; 
              padding: 16px; 
              margin: 24px 0; 
              border-radius: 6px;
            }
            .warning p { 
              color: #92400e; 
              font-weight: 500; 
              font-size: 14px;
            }
            .features { 
              margin: 32px 0;
            }
            .features h3 { 
              color: #1f2937; 
              font-size: 18px; 
              margin-bottom: 16px; 
              font-weight: 600;
            }
            .features ul { 
              list-style: none; 
              padding: 0;
            }
            .features li { 
              padding: 8px 0; 
              color: #4b5563; 
              position: relative; 
              padding-left: 24px;
            }
            .features li:before { 
              content: "✓"; 
              color: ${config.primaryColor}; 
              font-weight: bold; 
              position: absolute; 
              left: 0;
            }
            .button-container { 
              text-align: center; 
              margin: 40px 0;
            }
            .button { 
              display: inline-block; 
              padding: 16px 32px; 
              background: linear-gradient(135deg, ${config.gradientStart} 0%, ${config.gradientEnd} 100%); 
              color: white; 
              text-decoration: none; 
              border-radius: 8px; 
              font-weight: 600; 
              font-size: 16px; 
              transition: all 0.3s ease;
              box-shadow: 0 4px 12px ${config.primaryColor}30;
            }
            .button:hover { 
              transform: translateY(-2px); 
              box-shadow: 0 6px 20px ${config.primaryColor}40;
            }
            .support { 
              margin-top: 32px; 
              padding-top: 24px; 
              border-top: 1px solid #e5e7eb;
            }
            .signature { 
              margin-top: 32px; 
              color: #4b5563; 
              font-style: italic;
            }
            .footer { 
              background-color: #f9fafb; 
              text-align: center; 
              padding: 24px 30px; 
              border-top: 1px solid #e5e7eb;
            }
            .footer p { 
              color: #6b7280; 
              font-size: 12px; 
              margin: 4px 0;
            }
            .footer .company { 
              font-weight: 600; 
              color: #374151;
            }
            @media (max-width: 600px) {
              .email-wrapper { padding: 20px 10px; }
              .header { padding: 30px 20px; }
              .content { padding: 30px 20px; }
              .header h1 { font-size: 24px; }
              .button { padding: 14px 28px; font-size: 14px; }
            }
          </style>
        </head>
        <body>
          <div class="email-wrapper">
            <div class="container">
              <div class="header">
                <h1>${config.title}</h1>
                <p>${config.subtitle}</p>
              </div>
              <div class="content">
                <div class="greeting">Bonjour ${name},</div>
                
                <div class="message">
                  Félicitations ! Votre compte ${accountType === 'client' ? 'client' : accountType === 'internal' ? 'personnel' : 'administrateur'} SNA GZ a été créé avec succès. Vous pouvez maintenant accéder à votre espace dédié.
                </div>
                
                <div class="credentials">
                  <h3>🔐 Vos identifiants de connexion</h3>
                  <div class="credential-item">
                    <div class="credential-label">Adresse email</div>
                    <div class="credential-value">${email}</div>
                  </div>
                  <div class="credential-item">
                    <div class="credential-label">Mot de passe temporaire</div>
                    <div class="credential-value">${temporaryPassword}</div>
                  </div>
                </div>
                
                <div class="warning">
                  <p><strong>🔒 Important :</strong> Vous devez changer ce mot de passe temporaire lors de votre première connexion pour sécuriser votre compte.</p>
                </div>
                
                <div class="features">
                  <h3>🚀 Vos nouveaux accès</h3>
                  <ul>
                    ${config.features.map(feature => `<li>${feature}</li>`).join('')}
                  </ul>
                </div>
                
                <div class="button-container">
                  <a href="${config.loginUrl}" class="button">
                    Se connecter maintenant
                  </a>
                </div>
                
                <div class="support">
                  <div class="message">
                    Une question ? Notre équipe est disponible pour vous accompagner !
                  </div>
                </div>
                
                <div class="signature">
                  Cordialement,<br>
                  <strong>L'équipe SNA GZ</strong>
                </div>
              </div>
              <div class="footer">
                <p>Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
                <p class="company">SNA GZ - Solutions E-commerce Innovantes</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      const textContent = `
        ${config.title} - ${config.subtitle}
        
        Bonjour ${name},
        
        Félicitations ! Votre compte ${accountType === 'client' ? 'client' : accountType === 'internal' ? 'personnel' : 'administrateur'} SNA GZ a été créé avec succès.
        
        🔐 VOS IDENTIFIANTS DE CONNEXION :
        ================================
        Adresse email : ${email}
        Mot de passe temporaire : ${temporaryPassword}
        
        🔒 IMPORTANT :
        Vous devez changer ce mot de passe temporaire lors de votre première connexion.
        
        🚀 VOS NOUVEAUX ACCÈS :
        ${config.features.map(feature => `• ${feature}`).join('\n        ')}
        
        SE CONNECTER :
        ${config.loginUrl}
        
        Une question ? Notre équipe est disponible pour vous accompagner !
        
        Cordialement,
        L'équipe SNA GZ - Solutions E-commerce Innovantes
        
        ---
        Cet email a été envoyé automatiquement, merci de ne pas y répondre.
      `;

      const mailOptions = {
        from: process.env.EMAIL_FROM_NAME 
          ? `${process.env.EMAIL_FROM_NAME} <${process.env.EMAIL_FROM_ADDRESS || 'noreply@snagz.com'}>`
          : process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_FROM || 'noreply@snagz.com',
        to: email,
        subject: subject,
        text: textContent,
        html: htmlContent
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      // Email logging removed for security

      return {
        success: true,
        recipient: email,
        messageId: result.messageId,
        accountType: accountType
      };

    } catch (error) {
      logger.error('❌ Failed to send account creation email:', error);
      return {
        success: false,
        error: error.message,
        recipient: email,
        accountType: accountType
      };
    }
  }
}

// Create singleton instance
const emailService = new EmailService();

// Export functions for backward compatibility
module.exports = {
  sendWelcomeEmail: (email, name, temporaryPassword) => 
    emailService.sendWelcomeEmail(email, name, temporaryPassword),
  
  sendPasswordResetEmail: (email, name, resetUrl) => 
    emailService.sendPasswordResetEmail(email, name, resetUrl),
  
  sendNotificationEmail: (email, name, subject, message) => 
    emailService.sendNotificationEmail(email, name, subject, message),
  
  sendAccountCreationEmail: (email, name, temporaryPassword, accountType) => 
    emailService.sendAccountCreationEmail(email, name, temporaryPassword, accountType),
  
  // Export the service instance for advanced usage
  emailService
};

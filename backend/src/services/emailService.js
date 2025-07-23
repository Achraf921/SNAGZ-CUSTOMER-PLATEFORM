const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  async initializeTransporter() {
    try {
      // Check if we have SMTP configuration
      if (process.env.SMTP_HOST && process.env.SMTP_PORT) {
        // Use SMTP configuration
        this.transporter = nodemailer.createTransporter({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT),
          secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          },
          tls: {
            rejectUnauthorized: false // Allow self-signed certificates
          }
        });
      } else if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
        // Use Gmail configuration
        this.transporter = nodemailer.createTransporter({
          service: 'gmail',
          auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD
          }
        });
      } else {
        // Use development configuration (Ethereal email for testing)
        console.log('📧 No email configuration found, using development mode');
        this.transporter = nodemailer.createTransporter({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: 'test@ethereal.email',
            pass: 'test123'
          }
        });
      }

      // Verify transporter configuration
      await this.transporter.verify();
      console.log('✅ Email service initialized successfully');
    } catch (error) {
      console.error('❌ Email service initialization failed:', error);
      this.transporter = null;
    }
  }

  async sendWelcomeEmail(email, name, temporaryPassword) {
    try {
      if (!this.transporter) {
        throw new Error('Email service not initialized');
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
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #0047AB; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .credentials { background-color: #e8f4fd; padding: 15px; border-left: 4px solid #0047AB; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            .button { display: inline-block; padding: 12px 24px; background-color: #0047AB; color: white; text-decoration: none; border-radius: 5px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Bienvenue chez SNA GZ</h1>
            </div>
            <div class="content">
              <p>Bonjour ${name},</p>
              
              <p>Nous sommes ravis de vous accueillir chez SNA GZ ! Votre compte a été créé avec succès.</p>
              
              <div class="credentials">
                <h3>Vos identifiants de connexion :</h3>
                <p><strong>Email :</strong> ${email}</p>
                <p><strong>Mot de passe temporaire :</strong> ${temporaryPassword}</p>
              </div>
              
              <p><strong>Important :</strong> Pour des raisons de sécurité, vous devrez changer votre mot de passe lors de votre première connexion.</p>
              
              <p>Vous pouvez maintenant accéder à votre espace client pour :</p>
              <ul>
                <li>Créer et gérer vos boutiques</li>
                <li>Ajouter vos produits</li>
                <li>Suivre vos projets</li>
                <li>Accéder à la documentation</li>
              </ul>
              
              <p style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/client/login" class="button">
                  Accéder à mon espace client
                </a>
              </p>
              
              <p>Si vous avez des questions ou besoin d'aide, n'hésitez pas à nous contacter.</p>
              
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

      const textContent = `
        Bienvenue chez SNA GZ
        
        Bonjour ${name},
        
        Nous sommes ravis de vous accueillir chez SNA GZ ! Votre compte a été créé avec succès.
        
        Vos identifiants de connexion :
        Email : ${email}
        Mot de passe temporaire : ${temporaryPassword}
        
        Important : Pour des raisons de sécurité, vous devrez changer votre mot de passe lors de votre première connexion.
        
        Vous pouvez maintenant accéder à votre espace client pour créer et gérer vos boutiques, ajouter vos produits, et suivre vos projets.
        
        Lien d'accès : ${process.env.FRONTEND_URL || 'http://localhost:3000'}/client/login
        
        Si vous avez des questions ou besoin d'aide, n'hésitez pas à nous contacter.
        
        Cordialement,
        L'équipe SNA GZ
      `;

      const mailOptions = {
        from: process.env.EMAIL_FROM || 'noreply@snagz.com',
        to: email,
        subject: subject,
        text: textContent,
        html: htmlContent
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      console.log('📧 Welcome email sent successfully:', {
        recipient: email,
        messageId: result.messageId,
        mode: process.env.NODE_ENV || 'development'
      });

      return {
        success: true,
        recipient: email,
        messageId: result.messageId,
        mode: process.env.NODE_ENV || 'development'
      };

    } catch (error) {
      console.error('❌ Failed to send welcome email:', error);
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
        throw new Error('Email service not initialized');
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
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #0047AB; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .warning { background-color: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            .button { display: inline-block; padding: 12px 24px; background-color: #0047AB; color: white; text-decoration: none; border-radius: 5px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Réinitialisation de mot de passe</h1>
            </div>
            <div class="content">
              <p>Bonjour ${name},</p>
              
              <p>Nous avons reçu une demande de réinitialisation de mot de passe pour votre compte SNA GZ.</p>
              
              <p style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" class="button">
                  Réinitialiser mon mot de passe
                </a>
              </p>
              
              <div class="warning">
                <h3>⚠️ Important :</h3>
                <ul>
                  <li>Ce lien est valable pendant 1 heure</li>
                  <li>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email</li>
                  <li>Ne partagez jamais ce lien avec quelqu'un d'autre</li>
                </ul>
              </div>
              
              <p>Si le bouton ne fonctionne pas, vous pouvez copier et coller ce lien dans votre navigateur :</p>
              <p style="word-break: break-all; color: #0047AB;">${resetUrl}</p>
              
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

      const textContent = `
        Réinitialisation de mot de passe - SNA GZ
        
        Bonjour ${name},
        
        Nous avons reçu une demande de réinitialisation de mot de passe pour votre compte SNA GZ.
        
        Pour réinitialiser votre mot de passe, cliquez sur le lien suivant :
        ${resetUrl}
        
        Important :
        - Ce lien est valable pendant 1 heure
        - Si vous n'avez pas demandé cette réinitialisation, ignorez cet email
        - Ne partagez jamais ce lien avec quelqu'un d'autre
        
        Cordialement,
        L'équipe SNA GZ
      `;

      const mailOptions = {
        from: process.env.EMAIL_FROM || 'noreply@snagz.com',
        to: email,
        subject: subject,
        text: textContent,
        html: htmlContent
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      console.log('📧 Password reset email sent successfully:', {
        recipient: email,
        messageId: result.messageId,
        mode: process.env.NODE_ENV || 'development'
      });

      return {
        success: true,
        recipient: email,
        messageId: result.messageId,
        mode: process.env.NODE_ENV || 'development'
      };

    } catch (error) {
      console.error('❌ Failed to send password reset email:', error);
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
        throw new Error('Email service not initialized');
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
            .header { background-color: #0047AB; color: white; padding: 20px; text-align: center; }
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
        from: process.env.EMAIL_FROM || 'noreply@snagz.com',
        to: email,
        subject: subject,
        html: htmlContent
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      console.log('📧 Notification email sent successfully:', {
        recipient: email,
        messageId: result.messageId,
        subject: subject
      });

      return {
        success: true,
        recipient: email,
        messageId: result.messageId
      };

    } catch (error) {
      console.error('❌ Failed to send notification email:', error);
      return {
        success: false,
        error: error.message,
        recipient: email
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
  
  // Export the service instance for advanced usage
  emailService
};

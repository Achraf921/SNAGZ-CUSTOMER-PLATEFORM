# 🛒 SNAGZ Customer Platform

A comprehensive full-stack SAAS application for automating Shopify store creation and management for SNA GZ's Direct-to-Consumer (D2C) e-commerce platform.

## 📋 Overview

The SNAGZ Customer Platform is an enterprise-grade solution that enables customers to create and manage Shopify stores through an intuitive web interface. The platform automates the entire process from initial store setup to product catalog management, integrating with multiple cloud services including AWS, Shopify, SharePoint, and MongoDB Atlas.

### 🎯 Core Purpose
- **Automated Shopify Store Creation**: Streamline the process of creating D2C e-commerce stores
- **Document Generation**: Automatically generate business documents, product catalogs, and compliance forms
- **Multi-tenant Architecture**: Support multiple customers with isolated data and permissions
- **Enterprise Integration**: Connect with SharePoint, AWS S3, and Shopify APIs for seamless workflow

## 🏗️ Architecture

### Frontend (React + Vite)
**Deployed on**: Vercel  
**Technology Stack**:
- **React 18** with modern hooks and functional components
- **Vite** for fast development and optimized builds
- **Tailwind CSS** + **Material-UI** for responsive design
- **React Router** for client-side routing
- **Axios** for API communication
- **React Hook Form** + **Yup** for form validation

### Backend (Node.js + Express)
**Deployed on**: AWS EC2 (Ubuntu)  
**Technology Stack**:
- **Node.js 18** with Express.js framework
- **MongoDB Atlas** for database storage
- **AWS SDK v3** for S3, Cognito, and KMS integration
- **Nginx** as reverse proxy with SSL termination
- **Python processors** for document generation (DOCX, XLSX)

### Cloud Services Integration
- **AWS Cognito**: User authentication and authorization
- **AWS S3**: File storage and document management
- **MongoDB Atlas**: Primary database with SSL encryption
- **Shopify API**: Store creation and management
- **Microsoft Graph API**: SharePoint integration
- **Let's Encrypt**: SSL certificate management

## 🚀 Key Features

### 👥 Multi-Role Authentication System
- **Customer Portal**: Self-service store creation and management
- **Internal Staff Portal**: Store validation and approval workflows
- **Admin Dashboard**: User management and system administration
- **Secure Authentication**: AWS Cognito with MFA support

### 🛍️ Shopify Store Management
- **Automated Store Creation**: One-click Shopify store deployment
- **Theme Customization**: Pre-configured Dawn theme with SNA GZ branding
- **Product Catalog Management**: Bulk product import and management
- **Inventory Synchronization**: Real-time inventory updates
- **Payment Configuration**: Automated payment gateway setup

### 📄 Document Automation
- **Business Documentation**: Auto-generation of CGV, legal documents
- **Product Catalogs**: Excel-based product specification sheets
- **Compliance Forms**: Automated regulatory compliance documentation
- **Template Management**: Customizable document templates via SharePoint

### 🔐 Enterprise Security
- **SSL/TLS Encryption**: End-to-end encryption for all communications
- **Rate Limiting**: Protection against abuse and DDoS attacks
- **Input Validation**: Comprehensive XSS and injection protection
- **Session Management**: Secure session handling with Redis-compatible storage
- **CORS Configuration**: Proper cross-origin resource sharing setup

### 📊 Data Management
- **File Upload System**: Secure file handling with size validation
- **Image Processing**: Automatic image optimization and validation
- **Database Migrations**: Structured data versioning and updates
- **Backup Systems**: Automated backups to AWS S3

## 📁 Project Structure

SNAGZ-CUSTOMER-PLATEFORM/
├── backend/ # Node.js Express API Server
│ ├── src/
│ │ ├── config/ # Database, SSL, and service configurations
│ │ ├── controllers/ # Business logic controllers
│ │ ├── middleware/ # Authentication, security, validation
│ │ ├── models/ # Database models and schemas
│ │ ├── routes/ # API route definitions
│ │ │ ├── auth.js # Authentication endpoints
│ │ │ ├── customer.js # Customer-facing APIs
│ │ │ ├── internal.js # Internal staff APIs
│ │ │ ├── shopify.js # Shopify integration
│ │ │ └── ...
│ │ ├── services/ # External service integrations
│ │ │ ├── shopifyService.js # Shopify API client
│ │ │ ├── s3Service.js # AWS S3 operations
│ │ │ ├── cognitoService.js # AWS Cognito auth
│ │ │ ├── sharepointService.js # Microsoft Graph API
│ │ │ ├── emailService.js # Email notifications
│ │ │ ├── docx_processor.py # Document generation
│ │ │ └── DawnTheme/ # Shopify theme files
│ │ ├── utils/ # Helper utilities and security tools
│ │ └── server.js # Main application entry point
│ ├── package.json # Backend dependencies
│ └── .env # Environment configuration
├── frontend/ # React SPA Application
│ ├── src/
│ │ ├── components/ # Reusable React components
│ │ │ ├── admin/ # Admin dashboard components
│ │ │ ├── auth/ # Login/authentication UI
│ │ │ ├── customer/ # Customer portal components
│ │ │ ├── internal/ # Internal staff interface
│ │ │ └── common/ # Shared UI components
│ │ ├── pages/ # Main page components
│ │ ├── services/ # API client services
│ │ ├── utils/ # Frontend utilities
│ │ └── App.jsx # Main application component
│ ├── public/ # Static assets
│ ├── package.json # Frontend dependencies
│ └── vercel.json # Vercel deployment config
└── docker-compose.test.yml # Docker testing configuration

## 🔧 API Endpoints

### Authentication Routes (`/auth`)
- `POST /auth/login` - User authentication
- `POST /auth/logout` - Session termination
- `POST /auth/refresh` - Token refresh
- `POST /auth/forgot-password` - Password reset initiation

### Customer Routes (`/customer`)
- `GET /customer/dashboard` - Customer dashboard data
- `POST /customer/shops` - Create new shop
- `GET /customer/shops` - List customer shops
- `PUT /customer/shops/:id` - Update shop details
- `POST /customer/products` - Add products to shop
- `GET /customer/products/:shopId` - Get shop products

### Internal Routes (`/internal`)
- `GET /internal/shops/pending` - Shops awaiting validation
- `PUT /internal/shops/:id/validate` - Validate/approve shop
- `GET /internal/clients` - List all clients
- `POST /internal/generate-docs` - Generate business documents

### Shopify Integration (`/shopify`)
- `POST /shopify/create-store` - Create Shopify store
- `PUT /shopify/configure/:storeId` - Configure store settings
- `POST /shopify/products/import` - Bulk product import
- `GET /shopify/orders/:storeId` - Retrieve store orders

### File Upload Routes
- `POST /upload/customer/images` - Customer image uploads
- `POST /upload/internal/documents` - Internal document uploads
- `GET /download/:fileId` - Secure file downloads

## 🛠️ Installation & Setup

### Prerequisites
- **Node.js** 18+ and npm 8+
- **Python** 3.8+ (for document processing)
- **MongoDB Atlas** account
- **AWS Account** with IAM permissions
- **Shopify Partner Account**
- **Domain name** for production deployment

### Environment Configuration

Create `.env` file in the backend directory:

```bash
# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority

# AWS Configuration
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=eu-west-3
COGNITO_USER_POOL_ID=your_pool_id
COGNITO_CLIENT_ID=your_client_id
COGNITO_CLIENT_SECRET=your_client_secret
S3_BUCKET_NAME=your_bucket_name

# Shopify API
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_secret
SHOPIFY_WEBHOOK_SECRET=your_webhook_secret

# SharePoint Integration
SHAREPOINT_TENANT_ID=your_tenant_id
SHAREPOINT_CLIENT_ID=your_client_id
SHAREPOINT_CLIENT_SECRET=your_client_secret

# Application URLs
FRONTEND_URL=https://snagz-customer-platform.vercel.app
PROD_APP_URL=https://your-domain.com

# Security
JWT_SECRET=your_jwt_secret_key
SESSION_SECRET=your_session_secret
FORCE_INSECURE_COOKIE=false
DISABLE_RATE_LIMIT=false

# Email Configuration
SMTP_HOST=your_smtp_host
SMTP_PORT=587
SMTP_USER=your_email@domain.com
SMTP_PASS=your_email_password

# reCAPTCHA
RECAPTCHA_SITE_KEY=your_site_key
RECAPTCHA_SECRET_KEY=your_secret_key
```

### Local Development

1. **Clone the repository**:
```bash
git clone https://github.com/your-username/SNAGZ-CUSTOMER-PLATEFORM.git
cd SNAGZ-CUSTOMER-PLATEFORM
```

2. **Backend setup**:
```bash
cd backend
npm install
pip3 install python-docx openpyxl pandas
npm run dev
```

3. **Frontend setup**:
```bash
cd frontend
npm install
npm run dev
```

4. **Access the application**:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

### Production Deployment

#### Backend (AWS EC2)
1. **Launch EC2 instance** (Ubuntu 22.04, t3.small or larger)
2. **Install dependencies**:
```bash
sudo apt update
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install nodejs python3 python3-pip nginx certbot python3-certbot-nginx
```

3. **Deploy application**:
```bash
git clone https://github.com/your-username/SNAGZ-CUSTOMER-PLATEFORM.git
cd SNAGZ-CUSTOMER-PLATEFORM/backend
npm ci --production
pip3 install python-docx openpyxl pandas
```

4. **Configure SSL with Let's Encrypt**:
```bash
sudo certbot --nginx -d your-domain.com
```

5. **Start server with PM2**:
```bash
npm install -g pm2
pm2 start src/server.js --name "snagz-backend"
pm2 startup
pm2 save
```

#### Frontend (Vercel)
1. **Connect GitHub repository** to Vercel
2. **Configure build settings**:
   - Build Command: `npm run build`
   - Output Directory: `dist`
3. **Set environment variables** in Vercel dashboard
4. **Deploy** - automatic deployment on git push

## 📊 Monitoring & Maintenance

### Health Checks
- **Backend Health**: `GET /health` endpoint
- **Database Connection**: Automatic reconnection handling
- **Service Status**: Individual service health monitoring

### Logging
- **Application Logs**: Winston-based structured logging
- **Access Logs**: Morgan HTTP request logging
- **Error Tracking**: Comprehensive error handling and reporting
- **Security Logs**: Authentication and authorization events

### Performance Monitoring
- **Response Times**: API endpoint performance tracking
- **Database Queries**: MongoDB operation monitoring
- **File Upload Metrics**: Upload success rates and sizes
- **User Activity**: Session and feature usage analytics

## 🔒 Security Features

### Authentication & Authorization
- **Multi-factor Authentication** via AWS Cognito
- **Role-based Access Control** (Customer, Internal, Admin)
- **Session Management** with secure cookies
- **JWT Token** validation and refresh

### Data Protection
- **Encryption at Rest** for all stored data
- **TLS 1.3** for data in transit
- **Input Sanitization** against XSS and injection attacks
- **File Upload Validation** with type and size restrictions

### Infrastructure Security
- **Rate Limiting** to prevent abuse
- **CORS Configuration** for cross-origin security
- **Security Headers** via Helmet.js
- **Environment Variable Protection** for sensitive data

## 🔄 Integration Points

### Shopify API Integration
- **Store Creation**: Automated Shopify store provisioning
- **Theme Installation**: Custom Dawn theme deployment
- **Product Management**: Bulk product operations
- **Order Processing**: Real-time order synchronization

### AWS Services
- **S3 Storage**: Secure file storage with presigned URLs
- **Cognito Authentication**: Enterprise-grade user management
- **KMS Encryption**: Key management for sensitive data

### Microsoft SharePoint
- **Document Templates**: Centralized template management
- **Content Synchronization**: Automated content updates
- **Approval Workflows**: Document approval processes

## 📈 Scalability Considerations

### Horizontal Scaling
- **Load Balancer**: Multiple backend instances
- **Database Sharding**: MongoDB cluster scaling
- **CDN Integration**: Global content delivery via Vercel

### Performance Optimization
- **Caching Strategy**: Redis for session and data caching
- **Database Indexing**: Optimized query performance
- **File Compression**: Automatic asset compression
- **API Rate Limiting**: Resource usage management

## 🐛 Troubleshooting

### Common Issues
1. **MongoDB Connection Errors**: Check connection string and network access
2. **Shopify API Rate Limits**: Implement exponential backoff
3. **File Upload Failures**: Verify S3 permissions and file size limits
4. **Authentication Issues**: Validate Cognito configuration

### Debug Mode
Enable debug logging with:
```bash
DEBUG=* NODE_ENV=development node src/server.js
```

### Health Checks
- Backend: `curl https://your-domain.com/health`
- Database: Check MongoDB Atlas dashboard
- Services: Monitor CloudWatch logs

## 👥 Contributing

1. **Fork the repository**
2. **Create feature branch**: `git checkout -b feature/new-feature`
3. **Commit changes**: `git commit -am 'Add new feature'`
4. **Push to branch**: `git push origin feature/new-feature`
5. **Create Pull Request**

### Code Standards
- **ESLint** for JavaScript linting
- **Prettier** for code formatting
- **Conventional Commits** for commit messages
- **Jest** for unit testing

## 📄 License

This project is proprietary software owned by SNA GZ. All rights reserved.

## 📞 Support

For technical support or questions:
- **Internal Team**: Contact development team
- **Customer Support**: Via platform support portal
- **Documentation**: Check inline code documentation

---

**Built with ❤️ by Achraf Bayi for SNA GZ's Direct-to-Consumer Platform**

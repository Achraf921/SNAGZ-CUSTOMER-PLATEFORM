# SNA GZ Shop Form Backend

This is the backend server for the SNA GZ Shop Form application.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory and add the following:
```
NODE_ENV=development
PORT=3000
```

3. Start the development server:
```bash
npm run dev
```

## Project Structure

```
backend/
├── src/
│   ├── controllers/    # Route controllers
│   ├── models/        # Database models
│   ├── routes/        # API routes
│   ├── middleware/    # Custom middleware
│   ├── config/        # Configuration files
│   ├── utils/         # Utility functions
│   └── server.js      # Main application file
├── .env              # Environment variables
├── .env.example      # Example environment variables
└── package.json
```

## Available Scripts

- `npm start`: Start the production server
- `npm run dev`: Start the development server with hot reload
- `npm test`: Run tests 
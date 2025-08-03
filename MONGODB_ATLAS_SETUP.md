# 🍃 MongoDB Atlas Setup Guide

## Step-by-Step Instructions

### 1. Create MongoDB Atlas Account
1. Go to: https://www.mongodb.com/cloud/atlas
2. Click "Try Free"
3. Sign up with your email or use Google/GitHub

### 2. Create Your First Cluster
1. **Choose Cloud Provider**: Select **AWS**
2. **Choose Region**: Select **Europe (Frankfurt)** or **Europe (Ireland)** (closest to your users)
3. **Cluster Tier**: Start with **M0 (Free Forever)** - perfect for development and small production
4. **Cluster Name**: `snagz-production`
5. Click **"Create Cluster"** (takes 1-3 minutes)

### 3. Configure Database Access
1. Go to **"Database Access"** in the left sidebar
2. Click **"Add New Database User"**
3. **Authentication Method**: Password
4. **Username**: `snagz-admin`
5. **Password**: Click "Autogenerate Secure Password" and **COPY IT!**
6. **Database User Privileges**: Select **"Read and write to any database"**
7. Click **"Add User"**

### 4. Configure Network Access
1. Go to **"Network Access"** in the left sidebar
2. Click **"Add IP Address"**
3. **For development**: Click **"Allow access from anywhere"** (0.0.0.0/0)
4. **For production**: We'll configure specific IPs later
5. Click **"Confirm"**

### 5. Get Your Connection String
1. Go to **"Clusters"** in the left sidebar
2. Click **"Connect"** on your cluster
3. Select **"Connect your application"**
4. **Driver**: Node.js
5. **Version**: 4.0 or later
6. **Copy the connection string** - it looks like:
   ```
   mongodb+srv://snagz-admin:<password>@snagz-production.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
7. **Replace `<password>`** with the password you copied earlier
8. **Add database name**: Change it to:
   ```
   mongodb+srv://snagz-admin:YOUR_PASSWORD@snagz-production.xxxxx.mongodb.net/snagz-production?retryWrites=true&w=majority
   ```

## Next: Update Your Environment Variables

After you get your connection string, you'll need to:

1. **Create `backend/.env`** file (copy from your existing .env or create new)
2. **Update MONGODB_URI** with your Atlas connection string
3. **Test the connection**

## Example Connection String Format:
```bash
MONGODB_URI=mongodb+srv://snagz-admin:YOUR_GENERATED_PASSWORD@snagz-production.abc123.mongodb.net/snagz-production?retryWrites=true&w=majority
```

## Security Notes:
- ✅ **Never commit your .env file** to version control
- ✅ **Use strong passwords** (use MongoDB's auto-generated ones)
- ✅ **Restrict IP access** in production
- ✅ **Enable monitoring** in Atlas dashboard

## Common Issues:
- **Connection timeout**: Check network access settings
- **Authentication failed**: Verify username/password
- **DNS issues**: Ensure your network allows MongoDB connections

---

**Let me know when you have your connection string ready!** 🚀
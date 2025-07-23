# reCAPTCHA Setup Guide

## Required Environment Variables

Add these environment variables to your `.env` files:

### Backend (.env)
```bash
# reCAPTCHA Secret Key (server-side verification)
RECAPTCHA_SECRET_KEY=your_recaptcha_secret_key_here

# Frontend URL for password reset emails
FRONTEND_URL=http://localhost:3000
```

### Frontend (.env or .env.local)
```bash
# reCAPTCHA Site Key (client-side display)
REACT_APP_RECAPTCHA_SITE_KEY=your_recaptcha_site_key_here
```

## Getting reCAPTCHA Keys

1. **Go to Google reCAPTCHA Admin Console:**
   - Visit: https://www.google.com/recaptcha/admin/create

2. **Create a new site:**
   - Choose **reCAPTCHA v2** → "I'm not a robot" Checkbox
   - Add your domains:
     - `localhost` (for development)
     - `your-production-domain.com` (for production)

3. **Get your keys:**
   - **Site Key**: Use in frontend (`REACT_APP_RECAPTCHA_SITE_KEY`)
   - **Secret Key**: Use in backend (`RECAPTCHA_SECRET_KEY`)

## Development Mode

If reCAPTCHA keys are not configured, the system will:
- **Frontend**: Show a warning message instead of the CAPTCHA widget
- **Backend**: Bypass CAPTCHA verification in development mode

## Security Features

- ✅ **Login Protection**: All login attempts require CAPTCHA verification
- ✅ **Password Reset Protection**: Forgot password requests require CAPTCHA
- ✅ **Token Validation**: Backend verifies CAPTCHA tokens with Google
- ✅ **Error Handling**: Graceful fallback when CAPTCHA is misconfigured
- ✅ **Rate Limiting**: CAPTCHA helps prevent automated attacks

## Testing

1. **Configure reCAPTCHA keys** in your environment variables
2. **Restart your servers** (backend and frontend)
3. **Test login flows** - CAPTCHA should appear and be required
4. **Test forgot password** - CAPTCHA should be required for reset requests
5. **Verify backend logs** - Should show CAPTCHA verification results

## Troubleshooting

### CAPTCHA not showing
- Check `REACT_APP_RECAPTCHA_SITE_KEY` is set correctly
- Verify domain is added to reCAPTCHA admin console
- Check browser console for errors

### CAPTCHA verification failing
- Check `RECAPTCHA_SECRET_KEY` is set correctly
- Verify keys are from the same reCAPTCHA site
- Check backend logs for detailed error messages

### Development bypassing
- Set `NODE_ENV=production` to enforce CAPTCHA verification
- Or configure proper reCAPTCHA keys for development 
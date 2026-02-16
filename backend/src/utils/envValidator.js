/**
 * Environment Variable Validator for Production
 * Validates all required environment variables on startup
 */

const requiredEnvVars = {
  // Database
  MONGODB_URI: 'MongoDB connection string',
  
  // Server
  PORT: 'Server port',
  NODE_ENV: 'Node environment',
  FRONTEND_URL: 'Frontend URL',
  BACKEND_URL: 'Backend URL for webhooks (e.g., https://api.yourdomain.com)',
  
  // Security
  JWT_SECRET: 'JWT secret key',
  
  // Stripe
  STRIPE_SECRET_KEY: 'Stripe secret key',
  STRIPE_WEBHOOK_SECRET: 'Stripe webhook secret',
  
  // Telnyx
  TELNYX_API_KEY: 'Telnyx API key',
  
  // Google OAuth (optional but recommended)
  GOOGLE_CLIENT_ID: 'Google OAuth client ID (optional)',
  GOOGLE_CLIENT_SECRET: 'Google OAuth client secret (optional)',
  GOOGLE_CALLBACK_URL: 'Google OAuth callback URL (optional)',
};

const optionalEnvVars = {
  JWT_EXPIRES_IN: '7d',
  EMAIL_HOST: '',
  EMAIL_PORT: '587',
  EMAIL_USER: '',
  EMAIL_PASS: '',
  GA4_PROPERTY_ID: '',
  GOOGLE_ANALYTICS_PROPERTY_ID: '',
  GOOGLE_ANALYTICS_SERVICE_ACCOUNT_JSON: '',
  GOOGLE_ANALYTICS_SERVICE_ACCOUNT_BASE64: '',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: '',
  GOOGLE_PRIVATE_KEY: '',
  SUBSCRIPTION_RECONCILIATION_ENABLED: 'true',
  SUBSCRIPTION_RECONCILIATION_INTERVAL_MINUTES: '15',
  SUBSCRIPTION_RECONCILIATION_WINDOW_HOURS: '72',
  SUBSCRIPTION_RECONCILIATION_MAX_INVOICES: '300',
  SUBSCRIPTION_RECONCILIATION_SYNC_MAX_PAGES: '6',
  SUBSCRIPTION_RECONCILIATION_AUTO_REPAIR: 'true',
  REQUEST_BODY_LIMIT: '25mb',
  TELNYX_MAX_MONTHLY_NUMBER_COST: '3.0',
  TELNYX_MAX_MESSAGING_RATE: '0.02',
  TELNYX_MAX_MONTHLY_NUMBER_COST_NON_US: '50.0',
  TELNYX_MAX_MESSAGING_RATE_NON_US: '1.0',
  TELNYX_REGULATORY_CACHE_TTL_MS: '600000',
  TELNYX_REQUIREMENT_GROUP_CACHE_TTL_MS: '600000',
  TELNYX_PURCHASEABLE_CHECK_MAX_CANDIDATES: '300',
  TELNYX_PURCHASEABLE_CHECK_BATCH_SIZE: '12',
};

export function validateEnv() {
  const missing = [];
  const warnings = [];

  // Check required variables
  for (const [key, description] of Object.entries(requiredEnvVars)) {
    if (!process.env[key]) {
      // Google OAuth vars are optional
      if (key.startsWith('GOOGLE_')) {
        warnings.push(`⚠️  ${key} (${description}) - Not set. Google OAuth will be disabled.`);
      } else {
        missing.push(`❌ ${key} (${description})`);
      }
    } else {
      // Validate specific formats
      if (key === 'MONGODB_URI' && !process.env[key].startsWith('mongodb')) {
        warnings.push(`⚠️  ${key} doesn't look like a valid MongoDB URI`);
      }
      
      if (key === 'JWT_SECRET' && process.env[key].length < 32) {
        warnings.push(`⚠️  ${key} should be at least 32 characters long for security`);
      }
      
      if (key === 'FRONTEND_URL' && !process.env[key].startsWith('http')) {
        warnings.push(`⚠️  ${key} should include protocol (http:// or https://)`);
      }
    }
  }

  // Set defaults for optional variables
  for (const [key, defaultValue] of Object.entries(optionalEnvVars)) {
    if (!process.env[key] && defaultValue) {
      process.env[key] = defaultValue;
    }
  }

  // Output results
  if (missing.length > 0) {
    console.error('\n🚨 MISSING REQUIRED ENVIRONMENT VARIABLES:\n');
    missing.forEach(msg => console.error(msg));
    console.error('\n❌ Server cannot start without these variables.\n');
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn('\n⚠️  ENVIRONMENT WARNINGS:\n');
    warnings.forEach(msg => console.warn(msg));
    console.warn('');
  }

  if (process.env.NODE_ENV === 'production') {
    console.log('✅ Production environment variables validated');
    
    // Additional production checks
    if (process.env.JWT_SECRET === 'your-super-secret-jwt-key-change-this-in-production') {
      console.error('\n❌ ERROR: Please change JWT_SECRET from default value!\n');
      process.exit(1);
    }
    
    if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
      console.warn('⚠️  WARNING: Using Stripe test key in production!');
    }
    
    if (!process.env.FRONTEND_URL.startsWith('https://')) {
      console.warn('⚠️  WARNING: FRONTEND_URL should use HTTPS in production');
    }

    const gaProperty = process.env.GA4_PROPERTY_ID || process.env.GOOGLE_ANALYTICS_PROPERTY_ID;
    if (gaProperty && gaProperty.startsWith('G-')) {
      console.warn('⚠️  WARNING: GA4_PROPERTY_ID should be numeric property ID, not Measurement ID (G-...)');
    }
  }
}


# WebRTC Calling Setup Guide

This guide explains how to configure Telnyx WebRTC for real-time voice calling in OTO DIAL.

## Prerequisites

1. A Telnyx account with:
   - An active Mission Control Portal access
   - A purchased phone number
   - A Credential Connection configured for WebRTC

## Step 1: Create a Credential Connection in Telnyx

1. Log into [Telnyx Mission Control Portal](https://portal.telnyx.com)
2. Go to **Networking** → **Connections**
3. Click **Create Connection**
4. Select **Credential Connection**
5. Configure the connection:
   - **Name**: Something like "OTO-DIAL-WebRTC"
   - **Username**: Choose a SIP username (e.g., `otodial_user`)
   - **Password**: Create a secure password
6. Under **Outbound Settings**:
   - Set **Outbound Profile** to allow outbound calls
   - Configure your Caller ID settings
7. Save and note down:
   - **Connection ID** (shown on the connection page)
   - **SIP Username** (what you entered)
   - **SIP Password** (what you entered)

## Step 2: Configure Environment Variables

### Backend (.env)

Add these variables to your `backend/.env` file:

```env
# Telnyx Configuration
TELNYX_API_KEY=KEY_xxxxxxxxxxxxxxxxxxxx
TELNYX_SIP_USERNAME=your_sip_username
TELNYX_CONNECTION_ID=your_connection_id
```

Where:
- `TELNYX_API_KEY` - Your Telnyx API v2 key (from API Keys page)
- `TELNYX_SIP_USERNAME` - The SIP username from Step 1
- `TELNYX_CONNECTION_ID` - The Connection ID from Step 1

### Frontend (.env)

Add this variable to your `frontend/.env` file:

```env
VITE_TELNYX_SIP_PASSWORD=your_sip_password
```

Where:
- `VITE_TELNYX_SIP_PASSWORD` - The SIP password from Step 1

> ⚠️ **Security Note**: The SIP password is stored in the frontend because the WebRTC client runs in the browser and needs it to authenticate directly with Telnyx. This is the standard approach for WebRTC applications.

## Step 3: Assign Phone Number to Connection

1. In Telnyx Portal, go to **Numbers** → **My Numbers**
2. Select your purchased phone number
3. Under **Voice Settings**, set the **Connection** to your Credential Connection
4. Save

## Step 4: Restart Services

After configuring environment variables:

```bash
# Restart backend
cd backend
npm run dev

# Restart frontend
cd frontend
npm run dev
```

## How It Works

1. **User initiates call** → Frontend shows call window
2. **WebRTC client connects** → Browser connects to Telnyx using SIP credentials
3. **Call is made** → Audio is handled directly via WebRTC (browser ↔ Telnyx ↔ destination)
4. **Two-way audio** → Both parties can hear each other

## Features

- ✅ Outbound calls with two-way audio
- ✅ Incoming call notifications (in-app)
- ✅ Ringing sounds (generated via Web Audio API)
- ✅ Call duration tracking
- ✅ Mute/Hold/DTMF support
- ✅ iPhone-style incoming call UI

## Troubleshooting

### "SIP password not configured"
- Ensure `VITE_TELNYX_SIP_PASSWORD` is in your frontend `.env` file
- Restart the frontend development server

### "WebRTC not configured"
- Ensure `TELNYX_SIP_USERNAME` and `TELNYX_CONNECTION_ID` are in your backend `.env` file
- Restart the backend server

### No audio / one-way audio
- Check that your phone number is assigned to the Credential Connection
- Verify the Connection has outbound calling enabled
- Check browser microphone permissions
- Ensure no firewall is blocking WebRTC traffic (ports 10000-20000 UDP)

### "Active subscription required"
- User needs an active subscription to make calls
- Check the subscription status in the database

### Connection errors
- Verify SIP username and password are correct
- Check that the Connection ID matches your credential connection
- Ensure your Telnyx account has sufficient balance

## Browser Requirements

- Modern browser with WebRTC support (Chrome, Firefox, Safari, Edge)
- Microphone permission granted
- HTTPS connection (required for WebRTC in production)

## Testing Locally

When testing locally:
1. Use `localhost` or `127.0.0.1` (WebRTC works without HTTPS on localhost)
2. Allow microphone access when prompted
3. Make sure backend is running and connected to MongoDB
4. Verify you have an active subscription and purchased number

# WebRTC Calling Setup Guide

This guide explains how to configure real-time WebRTC calling in OTO DIAL.

## Overview

OTO DIAL now supports WebRTC-based calling which allows:
- **Real voice calls** from the browser (both incoming and outgoing)
- **Call window UI** with mute, hold, speaker, and dialpad controls
- **Incoming call notifications** (iPhone-style on mobile, banner on desktop)
- **Browser notifications** for incoming calls (even when app is in background)

## Prerequisites

1. A Telnyx account with Voice API enabled
2. A Telnyx Connection configured for WebRTC (SIP Connection)
3. Phone numbers assigned to the connection

## Backend Configuration

Add these environment variables to your backend `.env` file:

```env
# Existing Telnyx configuration
TELNYX_API_KEY=your_telnyx_api_key
TELNYX_CONNECTION_ID=your_connection_id

# NEW: WebRTC SIP Credentials
TELNYX_SIP_USERNAME=your_sip_username
```

### Getting SIP Credentials from Telnyx

1. Log in to the Telnyx Portal
2. Go to **SIP Connections** (under Voice section)
3. Create a new **Credential Connection** or use an existing one
4. Note down:
   - **SIP Username** (e.g., `your-app-name`)
   - **SIP Password** (you'll set this in frontend)
5. Assign your phone numbers to this connection

## Frontend Configuration

Add this to your frontend `.env` file:

```env
# WebRTC SIP Password
VITE_TELNYX_SIP_PASSWORD=your_sip_password
```

## How It Works

### Outgoing Calls

1. User enters a number and clicks "Call"
2. The app requests microphone permission
3. If WebRTC is configured:
   - Audio flows directly from browser to Telnyx via WebRTC
   - Full duplex audio (you can hear and speak)
4. If WebRTC is not configured:
   - Falls back to API-based calling (limited functionality)

### Incoming Calls

1. When someone calls your Telnyx number
2. Telnyx sends a webhook to your backend
3. Backend notifies the WebRTC client
4. User sees an incoming call notification
5. User can accept or reject the call

### Call Window Features

- **Avatar** with caller initials
- **Duration timer** showing call length
- **Mute** - Toggle microphone
- **Hold** - Put call on hold
- **Speaker** - Toggle speaker mode
- **Dialpad** - Send DTMF tones during call
- **End Call** - Disconnect the call

## File Structure

```
frontend/src/
├── context/
│   └── CallContext.jsx      # WebRTC call state management
├── components/
│   ├── CallWindow.jsx       # In-call UI component
│   └── IncomingCallNotification.jsx  # Incoming call UI
├── pages/
│   ├── Dialer.jsx           # Updated with call window
│   └── Recents.jsx          # Updated with call window

backend/src/routes/
└── webrtcRoutes.js          # WebRTC credentials endpoint
```

## Troubleshooting

### "Microphone access required"
- User must allow microphone permission in browser
- Ensure site is served over HTTPS (required for WebRTC)

### "Failed to connect to calling service"
- Check TELNYX_SIP_USERNAME is configured in backend
- Check VITE_TELNYX_SIP_PASSWORD is configured in frontend
- Verify credentials are correct in Telnyx portal

### Can't hear the other person
- Check speaker/volume settings
- Verify WebRTC connection is established (check browser console)
- Ensure microphone is working and not muted

### No incoming call notifications
- Enable browser notifications when prompted
- Check that WebRTC client is connected
- Verify webhook URL is configured in Telnyx for incoming calls

## Browser Compatibility

WebRTC calling works in:
- Chrome (recommended)
- Firefox
- Safari (iOS 14.3+)
- Edge (Chromium-based)

## Mobile Considerations

- On mobile, the call window takes full screen
- Incoming calls show iPhone-style accept/reject UI
- Bottom navigation is hidden during calls
- Works in PWA mode for best experience

# Logo Setup

To add your logo image:

1. Save your logo PNG file as `logo.png` in this `public` folder
2. The logo should be a square image (recommended: 120x120px or higher for better quality)
3. The Navbar will automatically use `/logo.png` to display your logo

## Alternative: Using Base64 Data

If you have base64 encoded image data, you can decode it using:

```bash
# Using Node.js (from frontend directory)
node save-logo.js <your_base64_string>

# Or using PowerShell (from frontend/public directory)
[System.Convert]::FromBase64String('<your_base64_string>') | Set-Content -Path logo.png -Encoding Byte
```

## Current Logo

The logo is expected at: `frontend/public/logo.png`


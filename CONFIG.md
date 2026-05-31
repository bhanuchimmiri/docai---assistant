# Configuration

## Setting your API Key

Open `app.js` and replace `"YOUR_API_KEY_HERE"` on line 4 with your actual Anthropic API key:

```javascript
const ANTHROPIC_API_KEY = "sk-ant-xxxxxxxxxxxxxxxx";
```

You can get an API key at https://console.anthropic.com

## Important

- Never commit your real API key to GitHub
- For production use, move API calls to a backend server (Node.js / Spring Boot)
- This project is configured for local/demo use only

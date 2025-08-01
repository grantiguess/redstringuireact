# RedString UI React

A revolutionary Git-native semantic web federation system with real-time collaboration, true decentralization, and censorship resistance.

## Features

- **Git-Native Federation**: Connect to any Git provider (GitHub, Gitea) for semantic storage
- **Real-time Collaboration**: Live synchronization across distributed networks
- **Censorship Resistance**: Decentralized storage with multiple provider support
- **OAuth Authentication**: Secure GitHub integration with OAuth 2.0
- **Advanced Configuration**: Flexible provider settings and schema management

## 🚀 **Instant Start - Zero Configuration!**

The app works **immediately** with no setup required:

```bash
npm install
npm run dev:full
```

Then open `http://localhost:4000` and click "Connect with GitHub" - it works instantly with demo data!

## 🎯 **How It Works**

### Zero-Config Mode (Default)
- ✅ **No GitHub OAuth app setup required**
- ✅ **No environment variables needed**
- ✅ **Works immediately with demo data**
- ✅ **Full OAuth experience simulation**
- ✅ **Repository selection and management**

### Real GitHub Mode (Optional)
- 🔧 **Only if you want real GitHub accounts**
- 🔧 **See PRODUCTION-SETUP.md for details**

## Security Notes
- Never commit your `.env` file to version control
- The Client Secret should only be used on the server side
- The frontend only needs the Client ID for the initial OAuth redirect

## Development

```bash
npm install
npm run dev
```

## Testing

```bash
npm test
```

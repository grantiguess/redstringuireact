# Claude Desktop Setup for Redstring

## 🎯 **What We've Set Up**

1. **Claude Desktop Configuration**: Updated `claude_desktop_config.json` to run a local API server
2. **API Server**: Created `claude-desktop-server.js` that Claude Desktop will run
3. **Redstring Integration**: Updated Redstring to connect to the Claude Desktop API

## 🚀 **Next Steps**

### **Step 1: Restart Claude Desktop**
1. Close Claude Desktop completely
2. Reopen Claude Desktop
3. It should automatically start the local server on port 3000

### **Step 2: Test the Connection**
1. Open Redstring in your browser
2. Click the brain icon in the **left panel**
3. You should see "Claude Desktop connected!" instead of "Mock AI Service"

### **Step 3: Verify the Server is Running**
You can test the API directly:
```bash
curl http://localhost:3000/api/health
```

Should return:
```json
{
  "status": "healthy",
  "service": "claude-desktop-api",
  "timestamp": "2024-01-XX...",
  "version": "1.0.0"
}
```

## 🔧 **How It Works**

1. **Claude Desktop** runs the `claude-desktop-server.js` file
2. **Redstring** connects to `http://localhost:3000/api/health`
3. **AI Operations** are sent to Claude Desktop for processing
4. **Responses** come back through the API to Redstring

## 🎨 **Features Available**

- **Health Check**: `/api/health` - Connection status
- **Conversation**: `/api/conversation/*` - Chat with Claude
- **Operations**: `/api/operation/execute` - AI operations like knowledge exploration

## 🐛 **Troubleshooting**

### **If Claude Desktop doesn't start the server:**
1. Check the Claude Desktop logs
2. Verify the config file path is correct
3. Make sure Node.js is installed

### **If Redstring can't connect:**
1. Check if port 3000 is available
2. Verify the server is running: `curl http://localhost:3000/api/health`
3. Check browser console for connection errors

### **If you get CORS errors:**
The server includes CORS headers, but if you still get errors, you may need to restart both Claude Desktop and your browser.

## 🎉 **Success Indicators**

- Redstring shows "Claude Desktop connected!" in the AI panel
- No more "ERR_CONNECTION_REFUSED" errors in the console
- AI responses come from Claude Desktop instead of the mock service

## 🔄 **Fallback Behavior**

If Claude Desktop is not available, Redstring will automatically fall back to the mock AI service, so the UI will always work for testing. 
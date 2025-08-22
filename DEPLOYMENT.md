# 🚀 Free Bot Hosting Guide

## Option 1: Railway (Recommended - Easiest)

### Step 1: Prepare Your Bot
1. Make sure your bot is working locally
2. All environment variables are set in `.env` file
3. Bot has been built (`npm run build`)

### Step 2: Deploy to Railway
1. Go to [railway.app](https://railway.app) and sign up with GitHub
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Add environment variables:
   - `DISCORD_TOKEN`
   - `TELEGRAM_TOKEN` 
   - `TELEGRAM_CHAT_ID`
   - `GEMINI_API_KEY`
   - Any other variables from your `.env` file
5. Deploy!

### Step 3: Get Your Bot Running
- Railway will automatically build and start your bot
- Check the logs to ensure it's running
- Your bot will stay online 24/7

---

## Option 2: Render (Good Alternative)

### Step 1: Deploy to Render
1. Go to [render.com](https://render.com) and sign up
2. Click "New" → "Web Service"
3. Connect your GitHub repo
4. Configure:
   - **Name**: `discord-telegram-bot`
   - **Environment**: `Node`
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start`
5. Add environment variables
6. Deploy!

### Step 3: Keep It Awake
- Render free tier sleeps after 15 minutes of inactivity
- Use [UptimeRobot](https://uptimerobot.com) to ping your bot every 5 minutes
- Free tier: 750 hours/month

---

## Option 3: Fly.io (Most Generous Free Tier)

### Step 1: Install Fly CLI
```bash
# Windows (PowerShell)
iwr https://fly.io/install.ps1 -useb | iex

# Or download from: https://fly.io/docs/hands-on/install-flyctl/
```

### Step 2: Deploy
```bash
fly auth signup
fly launch
fly deploy
```

### Step 3: Scale
```bash
fly scale count 1
```

---

## Option 4: Oracle Cloud (Most Powerful Free Tier)

### Step 1: Sign Up
1. Go to [oracle.com/cloud/free](https://oracle.com/cloud/free)
2. Sign up (requires credit card for verification)
3. Create a VM instance

### Step 2: Setup Server
```bash
# Connect to your VM
ssh ubuntu@your-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone and run your bot
git clone your-repo
cd your-repo
npm install
npm run build
npm start
```

---

## 🔧 Environment Variables Needed

Make sure these are set in your hosting platform:

```env
DISCORD_TOKEN=your_discord_bot_token
TELEGRAM_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_chat_id
GEMINI_API_KEY=your_gemini_api_key
OUTPUT_BACKEND=telegram
DISCORD_BOT_BACKEND=bot
```

## 📊 Comparison Table

| Platform | Free Tier | Ease of Use | Performance | 24/7 Uptime |
|----------|-----------|-------------|-------------|--------------|
| **Railway** | $5/month credit | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ✅ Yes |
| **Render** | 750 hours/month | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ❌ Sleeps |
| **Fly.io** | 3 VMs, 3GB | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ✅ Yes |
| **Oracle** | 2 VMs, 24GB | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ✅ Yes |

## 🎯 **Recommendation**

**Start with Railway** - it's the easiest to set up and gives you reliable 24/7 hosting. The $5 monthly credit is usually enough for a Discord bot, and if you need more, you can easily upgrade.

**Need help?** Check the Railway logs if something goes wrong - they're very helpful for debugging!

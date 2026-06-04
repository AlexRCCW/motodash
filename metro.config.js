const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Block Node.js built-ins that Supabase's ws dependency tries to import.
// React Native has WebSocket built in globally so Supabase falls back automatically.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'ws' || moduleName === 'stream' || moduleName === 'crypto') {
    return { type: 'empty' };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

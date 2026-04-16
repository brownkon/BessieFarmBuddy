require('dotenv').config();

const { expo } = require('./app.json');

module.exports = () => {
  const googleMapsApiKey =
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    '';

  return {
    ...expo,
    android: {
      ...expo.android,
      config: {
        ...(expo.android?.config || {}),
        googleMaps: {
          apiKey: googleMapsApiKey,
        },
      },
    },
  };
};

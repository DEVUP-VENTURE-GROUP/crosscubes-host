const buildConfig = require('@crosscubes/core/app-config');

// Own Metro port, so a bare `expo start` never lands on 8081-8083 used by other projects.
process.env.RCT_METRO_PORT ||= '8090';

module.exports = () =>
  buildConfig({
    id: 'customer',
    name: 'CrossCubes',
    slug: 'crosscubes',
    scheme: 'crosscubes',
    version: '1.0.0',
    bundleId: 'com.crosscubes.app',
    projectId: 'c55a3015-f0c6-4b09-8445-281fecf1d5d2',
    iconBackground: '#f8f6f2',
    cameraReason: 'CrossCubes uses the camera to scan your licence, take your verification selfie and photograph the car at pickup and return.',
    photosReason: 'CrossCubes lets you choose photos of your licence or the car from your library.',
    locationReason: 'CrossCubes uses your location to show cars near you and to record where trip photos were taken.',
    plugins: [['@stripe/stripe-react-native', { merchantIdentifier: 'merchant.com.crosscubes.app', enableGooglePay: true }]],
  });

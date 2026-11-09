const buildConfig = require('@crosscubes/core/app-config');

// Own Metro port, so a bare `expo start` never lands on 8081-8083 used by other projects.
process.env.RCT_METRO_PORT ||= '8091';

module.exports = () =>
  buildConfig({
    id: 'partner',
    name: 'CrossCubes Partner',
    slug: 'crosscubes-partner',
    scheme: 'crosscubes-partner',
    version: '1.0.0',
    bundleId: 'com.crosscubes.partner',
    projectId: '6dfa0b83-542b-449b-b82a-58c160278058',
    iconBackground: '#15120f',
    cameraReason: 'CrossCubes Partner uses the camera to photograph your cars, documents and the car at pickup and return.',
    photosReason: 'CrossCubes Partner lets you choose photos of your cars and documents from your library.',
    locationReason: 'CrossCubes Partner uses your location to record where pickup and return photos were taken.',
  });

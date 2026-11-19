// Metro stand-in for Vite's `?inline` import in the vendored ui-native (see vendor/ui-native/VENDORED.md): the vendored
// brand.tsx reads a PNG as a URI string. Metro has no `?inline`, so the PNG is a normal asset and this resolves it to its URI.
// Deleted with the vendor directory once the published package (which inlines it at build time) replaces it.
const { Image } = require('react-native');
module.exports = Image.resolveAssetSource(require('../vendor/ui-native/brand/midnite-logo-light.png')).uri;

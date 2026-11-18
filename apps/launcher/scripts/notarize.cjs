const { notarize } = require('@electron/notarize');

/**
 * Credential choice, in order: (1) an App Store Connect API key (all three of APPLE_API_KEY,
 * APPLE_API_KEY_ID, APPLE_API_ISSUER); (2) the Apple ID trio; (3) null — nothing to notarise with,
 * the build stays as it is. A partial API-key set falls through, never throws.
 * Keep identical to apps/launcher/scripts/notarize.cjs.
 */
function notarizeOptions(env, appPath) {
  if (env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER) {
    return {
      appPath,
      appleApiKey: env.APPLE_API_KEY,
      appleApiKeyId: env.APPLE_API_KEY_ID,
      appleApiIssuer: env.APPLE_API_ISSUER,
    };
  }
  if (env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID) {
    return {
      appPath,
      appleId: env.APPLE_ID,
      appleIdPassword: env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: env.APPLE_TEAM_ID,
    };
  }
  return null;
}

exports.notarizeOptions = notarizeOptions;

exports.default = async function notarizeApp(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = packager.appInfo.productFilename;
  const options = notarizeOptions(process.env, `${appOutDir}/${appName}.app`);

  if (!options) {
    console.log('[notarize] skipped (missing Apple credentials in env)');
    return;
  }

  console.log(`[notarize] Notarizing ${appName}...`);
  await notarize(options);
  console.log(`[notarize] Successfully notarized ${appName}`);
};

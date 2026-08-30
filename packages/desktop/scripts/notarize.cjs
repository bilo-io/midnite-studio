const { notarize } = require('@electron/notarize');

exports.default = async function notarizeApp(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  const appleId = process.env.APPLE_ID;
  const appleAppSpecificPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const appleTeamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleAppSpecificPassword || !appleTeamId) {
    console.log('[notarize] skipped (missing Apple credentials in env)');
    return;
  }

  console.log(`[notarize] Notarizing ${appName}...`);
  await notarize({
    appPath,
    appleId,
    appleIdPassword: appleAppSpecificPassword,
    teamId: appleTeamId,
  });
  console.log(`[notarize] Successfully notarized ${appName}`);
};

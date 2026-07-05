const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Google Sign-In's native SDK (9.x) pulls in AppCheckCore, which depends on
// GoogleUtilities/RecaptchaInterop — pods that don't yet support Expo's
// "modular headers" static-library mode (see react-native-google-signin#1517,
// an unpatched upstream bug as of this writing). The fix is to force just
// those specific pods to build as plain static libraries via a Podfile
// pre_install hook, rather than trying to modularize everything.
function withGoogleSignInPodFix(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let podfile = fs.readFileSync(podfilePath, 'utf-8');

      const hook = `
pre_install do |installer|
  installer.pod_targets.each do |pod|
    if ['GoogleUtilities', 'RecaptchaInterop', 'AppCheckCore'].include?(pod.name)
      def pod.build_type
        Pod::BuildType.static_library
      end
    end
  end
end
`;

      if (!podfile.includes('GoogleUtilities') || !podfile.includes('pre_install do |installer|')) {
        // insert right after the `platform :ios` line so it runs before pod resolution
        podfile = podfile.replace(
          /(platform :ios.*\n)/,
          `$1${hook}\n`
        );
        fs.writeFileSync(podfilePath, podfile);
      }

      return config;
    },
  ]);
}

module.exports = withGoogleSignInPodFix;

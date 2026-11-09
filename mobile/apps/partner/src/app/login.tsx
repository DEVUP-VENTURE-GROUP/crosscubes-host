import { SignInScreen, openInAppBrowser, webUrl } from '@crosscubes/core';
import { Text } from '@crosscubes/ui';

/** Partners sign in here; new partners apply on the website, the app never creates accounts. */
export default function LoginScreen() {
  return (
    <SignInScreen
      title="CrossCubes Partner"
      subtitle="Sign in to manage your cars, trips and earnings."
      home="/"
      forgotPath="/forgot-password"
      footer={
        <Text tone="muted" center>
          New to CrossCubes?{' '}
          <Text variant="label" tone="primary" accessibilityRole="link" onPress={() => void openInAppBrowser(webUrl('/asset-partners'))}>
            Become a partner
          </Text>
        </Text>
      }
    />
  );
}

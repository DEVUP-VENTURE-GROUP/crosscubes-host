import { useState } from 'react';
import { View } from 'react-native';
import { Check, Store } from 'lucide-react-native';
import { Button, Card, Input, RadioCard, Screen, Text, space, useTheme } from '@crosscubes/ui';
import { openInAppBrowser, useSignOut, webUrl } from '@crosscubes/core';
import { useOnboardHost } from '@crosscubes/core/web/features/host/hooks';
import { config } from '@crosscubes/core/web/lib/config';

type Path = 'host';

const HOST_POINTS = [
  'You set the price - or let Smart Price do it for you',
  'Cash out instantly, or on the standard payout schedule',
  'Every guest is verified before they can book',
];

/** An account with no workspace yet: the website's host sign-up and organisation set-up, in one place. */
export function GetStarted() {
  const { c } = useTheme();
  const { signOut, pending } = useSignOut('/login');
  const [path, setPath] = useState<Path>('host');
  const [displayName, setDisplayName] = useState('');
  const onboard = useOnboardHost();

  return (
    <Screen>
      <View style={{ gap: space.sm, marginTop: space.lg }}>
        <Text variant="small" tone="primary" style={{ letterSpacing: 2 }}>{`WELCOME TO ${config.appName.toUpperCase()}`}</Text>
        <Text variant="title">How will you use the app?</Text>
        <Text tone="muted">This account has no workspace yet. Pick one to set up - it takes about a minute.</Text>
      </View>

      <RadioCard selected={path === 'host'} onPress={() => setPath('host')} title="Host my car" detail="List in minutes, set your own price and keep control of your calendar." />

      {path === 'host' && (
        <Card>
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
            <Store size={20} color={c.primary} />
            <Text variant="heading">{`Become a ${config.appName} host`}</Text>
          </View>
          <View style={{ gap: space.sm, marginTop: space.md }}>
            {HOST_POINTS.map((p) => (
              <View key={p} style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
                <Check size={16} color={c.primary} />
                <Text variant="caption" style={{ flex: 1 }}>{p}</Text>
              </View>
            ))}
          </View>
          <View style={{ gap: space.md, marginTop: space.lg }}>
            <Input label="Display name" hint="Shown to guests on your listings." value={displayName} onChangeText={setDisplayName} autoCapitalize="words" />
            <Button title="Start hosting" disabled={!displayName.trim()} loading={onboard.isPending} onPress={() => onboard.mutate(displayName.trim())} />
            <Text variant="caption" tone="muted" center>Free to list. You only pay when you earn.</Text>
          </View>
        </Card>
      )}

      <Button title="Become an Asset Partner instead" variant="ghost" onPress={() => void openInAppBrowser(webUrl('/asset-partners'))} />
      <Button title="Sign out" variant="ghost" loading={pending} onPress={() => void signOut()} />
    </Screen>
  );
}

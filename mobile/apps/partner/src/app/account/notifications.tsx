import { NotificationSettingsScreen, RequireAuth } from '@crosscubes/core';

export default function Notifications() {
  return (
    <RequireAuth>
      <NotificationSettingsScreen />
    </RequireAuth>
  );
}

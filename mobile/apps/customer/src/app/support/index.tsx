import { RequireAuth, SupportScreen } from '@crosscubes/core';

export default function Support() {
  return (
    <RequireAuth>
      <SupportScreen />
    </RequireAuth>
  );
}

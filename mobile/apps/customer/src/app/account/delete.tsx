import { DeleteAccountScreen, RequireAuth } from '@crosscubes/core';

export default function DeleteAccount() {
  return (
    <RequireAuth>
      <DeleteAccountScreen afterPath="/" />
    </RequireAuth>
  );
}

import { RequireAuth, TicketScreen } from '@crosscubes/core';

export default function Ticket() {
  return (
    <RequireAuth>
      <TicketScreen />
    </RequireAuth>
  );
}

export interface ICreateTicketProps {
  functionBaseUrl: string;
  functionKey: string;
  userEmail: string;
  // The person chosen from the dashboard's "I am:" list — a record from
  // /v2/ticketing/app-user-contact (uid, clientId, firstName, lastName, email).
  requester: Record<string, unknown>;
  onBack: () => void;
  onCreated: (ticketId?: unknown) => void;
}

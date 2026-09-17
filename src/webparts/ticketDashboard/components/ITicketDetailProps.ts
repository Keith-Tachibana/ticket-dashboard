export interface ITicketDetailProps {
  ticketId: number;
  functionBaseUrl: string;
  functionKey: string;
  userEmail: string;
  onBack: () => void;
  fallbackDescription?: unknown;
}

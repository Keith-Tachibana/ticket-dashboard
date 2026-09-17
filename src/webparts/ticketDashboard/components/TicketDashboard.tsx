import * as React from 'react';
import styles from './TicketDashboard.module.scss';
import { ITicketDashboardProps } from './ITicketDashboardProps';
import { callProxy, renderField, toFirstLetterCaps, formatTime, omitQuotations } from './proxyClient';
import TicketDetail from './TicketDetail';

type JsonObject = Record<string, unknown>;

interface ITicketDashboardState {
  tickets: JsonObject[];
  loading: boolean;
  error: string | null;
  selectedTicket: JsonObject | null;
}

export default class TicketDashboard extends React.Component<ITicketDashboardProps, ITicketDashboardState> {

  constructor(props: ITicketDashboardProps) {
    super(props);
    this.state = { tickets: [], loading: true, error: null, selectedTicket: null };
  }

  public componentDidMount(): void {
    void this.loadTickets();
  }

  private proxyConfig(): { functionBaseUrl: string; functionKey: string } {
    return { functionBaseUrl: this.props.functionBaseUrl, functionKey: this.props.functionKey };
  }

  private loadTickets = async (): Promise<void> => {
    const { functionBaseUrl, boardId } = this.props;

    if (!functionBaseUrl) {
      this.setState({ loading: false, error: 'Set the proxy base URL in the web part settings.' });
      return;
    }

    try {
      let resolvedBoardId = boardId;

      // No board configured — ask NinjaOne for the list and use the first one.
      if (!resolvedBoardId) {
        const boardsPayload = await callProxy(this.proxyConfig(), '/v2/ticketing/trigger/boards');
        const boards: JsonObject[] = Array.isArray(boardsPayload)
          ? (boardsPayload as JsonObject[])
          : (((boardsPayload as JsonObject).data || (boardsPayload as JsonObject).boards || []) as JsonObject[]);

        if (!boards || boards.length === 0) {
          throw new Error('No ticket boards found on this NinjaOne account.');
        }

        resolvedBoardId = String(boards[0].id);
      }

      // "Running" a board is how NinjaOne returns its ticket list.
      const result = (await callProxy(
        this.proxyConfig(),
        `/v2/ticketing/trigger/board/${resolvedBoardId}/run`,
        { method: 'POST', body: { pageSize: 50 } }
      )) as JsonObject;

      this.setState({ tickets: (result.data as JsonObject[]) || [], loading: false });
    } catch (err) {
      this.setState({ loading: false, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  };

  private selectTicket = (ticket: JsonObject): void => {
    this.setState({ selectedTicket: ticket });
  };

  public render(): React.ReactElement<ITicketDashboardProps> {
    const { functionBaseUrl, functionKey, userEmail } = this.props;
    const { tickets, loading, error, selectedTicket } = this.state;

    if (selectedTicket !== null) {
      return (
        <TicketDetail
          ticketId={Number(selectedTicket.id)}
          functionBaseUrl={functionBaseUrl}
          functionKey={functionKey}
          userEmail={userEmail}
          fallbackDescription={selectedTicket.description}
          onBack={() => this.setState({ selectedTicket: null })}
        />
      );
    }

    if (loading) {
      return <div className={styles.ticketDashboard}>Loading tickets…</div>;
    }

    if (error) {
      return <div className={styles.ticketDashboard}>{error}</div>;
    }

    return (
      <div className={styles.ticketDashboard}>
        <table className={styles.ticketTable}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Subject</th>
              <th>Date</th>
              <th>Requester</th>
              <th>Status</th>
              <th>Priority</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket) => (
              <tr
                key={renderField(ticket.id)}
                className={styles.clickableRow}
                onClick={() => this.selectTicket(ticket)}
              >
                <td>{renderField(ticket.id)}</td>
                <td>{renderField(ticket.summary)}</td>
                <td>{formatTime(ticket.createTime)}</td>
                <td>{renderField(omitQuotations(ticket.requester))}</td>
                <td>{renderField(ticket.status)}</td>
                <td>{toFirstLetterCaps(ticket.priority)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
}

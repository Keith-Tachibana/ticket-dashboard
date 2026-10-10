import * as React from 'react';
import styles from './TicketDashboard.module.scss';
import { ITicketDashboardProps } from './ITicketDashboardProps';
import { callProxy, renderField, toFirstLetterCaps, formatTime, contactLabel, toList } from './proxyClient';
import TicketDetail from './TicketDetail';
import CreateTicket from './CreateTicket';

type JsonObject = Record<string, unknown>;

interface ITicketDashboardState {
  tickets: JsonObject[];
  loading: boolean;
  error: string | null;
  selectedTicket: JsonObject | null;
  contacts: JsonObject[];
  contactsError: string | null;
  selectedRequesterUid: string;
  creatingFor: JsonObject | null;
  notice: string | null;
}

export default class TicketDashboard extends React.Component<ITicketDashboardProps, ITicketDashboardState> {

  constructor(props: ITicketDashboardProps) {
    super(props);
    this.state = {
      tickets: [],
      loading: true,
      error: null,
      selectedTicket: null,
      contacts: [],
      contactsError: null,
      selectedRequesterUid: '',
      creatingFor: null,
      notice: null
    };
  }

  public componentDidMount(): void {
    void this.loadTickets();
    void this.loadContacts();
  }

  private proxyConfig(): { functionBaseUrl: string; functionKey: string; userEmail: string } {
    return {
      functionBaseUrl: this.props.functionBaseUrl,
      functionKey: this.props.functionKey,
      userEmail: this.props.userEmail
    };
  }

  private loadTickets = async (): Promise<void> => {
    const { functionBaseUrl, boardId } = this.props;

    this.setState({ loading: true, error: null });

    if (!functionBaseUrl) {
      this.setState({ loading: false, error: 'Set the proxy base URL in the web part settings.' });
      return;
    }

    try {
      let resolvedBoardId = boardId;

      // No board configured — ask NinjaOne for the list and use the first one.
      if (!resolvedBoardId) {
        const boards = toList(await callProxy(this.proxyConfig(), '/v2/ticketing/trigger/boards'));

        if (boards.length === 0) {
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

  // Loads the "I am:" list. NinjaOne creates a contact record the first time
  // someone emails the help desk, so CONTACT records are the people who have
  // submitted at least one ticket. Technicians are left out of the list.
  private loadContacts = async (): Promise<void> => {
    const { functionBaseUrl, userEmail } = this.props;

    if (!functionBaseUrl) {
      return;
    }

    try {
      const all = toList(await callProxy(
        this.proxyConfig(),
        '/v2/ticketing/app-user-contact',
        { query: { pageSize: '1000' } }
      ));

      const onlyContacts = all.filter((c) => c.userType === 'CONTACT');
      const people = onlyContacts.length > 0 ? onlyContacts : all;
      people.sort((a, b) => contactLabel(a).localeCompare(contactLabel(b)));

      // Pre-select the person if their SharePoint sign-in email matches a contact.
      const lowerEmail = (userEmail || '').toLowerCase();
      const mine = lowerEmail
        ? people.filter((c) => typeof c.email === 'string' && c.email.toLowerCase() === lowerEmail)[0]
        : undefined;

      this.setState((prev) => ({
        contacts: people,
        contactsError: null,
        selectedRequesterUid: prev.selectedRequesterUid || (mine ? String(mine.uid) : '')
      }));
    } catch (err) {
      this.setState({ contactsError: err instanceof Error ? err.message : 'Could not load the list of users.' });
    }
  };

  private handleRequesterChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    this.setState({ selectedRequesterUid: event.target.value });
  };

  private startCreate = (): void => {
    const { contacts, selectedRequesterUid } = this.state;
    const person = contacts.filter((c) => String(c.uid) === selectedRequesterUid)[0];

    if (person) {
      this.setState({ creatingFor: person, notice: null });
    }
  };

  private handleCreated = (ticketId?: unknown): void => {
    const hasId = ticketId !== undefined && ticketId !== null;
    this.setState({
      creatingFor: null,
      notice: hasId ? `Ticket #${String(ticketId)} created.` : 'Ticket created.'
    });
    void this.loadTickets();
  };

  private selectTicket = (ticket: JsonObject): void => {
    this.setState({ selectedTicket: ticket });
  };

  public render(): React.ReactElement<ITicketDashboardProps> {
    const { functionBaseUrl, functionKey, userEmail } = this.props;
    const {
      tickets, loading, error, selectedTicket,
      contacts, contactsError, selectedRequesterUid, creatingFor, notice
    } = this.state;

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

    if (creatingFor !== null) {
      return (
        <CreateTicket
          functionBaseUrl={functionBaseUrl}
          functionKey={functionKey}
          userEmail={userEmail}
          requester={creatingFor}
          onBack={() => this.setState({ creatingFor: null })}
          onCreated={this.handleCreated}
        />
      );
    }

    return (
      <div className={styles.ticketDashboard}>
        <div className={styles.createBar}>
          <label htmlFor="requester-select">I am:</label>
          <select
            id="requester-select"
            value={selectedRequesterUid}
            onChange={this.handleRequesterChange}
          >
            <option value="">Select your name…</option>
            {contacts.map((contact) => (
              <option key={String(contact.uid)} value={String(contact.uid)}>
                {contactLabel(contact)}
              </option>
            ))}
          </select>
          <button onClick={this.startCreate} disabled={!selectedRequesterUid}>Create ticket</button>
        </div>

        {contactsError && <p className={styles.errorText}>{contactsError}</p>}
        {notice && <p className={styles.successText}>{notice}</p>}

        {loading && <p>Loading tickets…</p>}
        {!loading && error && <p className={styles.errorText}>{error}</p>}

        {!loading && !error && (
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
                  <td>{renderField(ticket.requester)}</td>
                  <td>{renderField(ticket.status)}</td>
                  <td>{toFirstLetterCaps(ticket.priority)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }
}

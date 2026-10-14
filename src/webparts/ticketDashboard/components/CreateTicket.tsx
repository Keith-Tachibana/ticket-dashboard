import * as React from 'react';
import styles from './TicketDashboard.module.scss';
import { ICreateTicketProps } from './ICreateTicketProps';
import { callProxy, contactLabel, proxyErrorCode, toList } from './proxyClient';

type JsonObject = Record<string, unknown>;

interface ICreateTicketState {
  subject: string;
  description: string;
  priority: string;
  severity: string;
  ticketFormId: number | null;
  formsError: string | null;
  submitting: boolean;
  error: string | null;
  needsConnect: boolean;
}

const PRIORITIES = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' }
];

const SEVERITIES = [
  { value: 'MINOR', label: 'Minor' },
  { value: 'MODERATE', label: 'Moderate' },
  { value: 'MAJOR', label: 'Major' },
  { value: 'CRITICAL', label: 'Critical' }
];

// NinjaOne's default "Open" status id. If your organization has customized
// its ticket statuses, GET /v2/ticketing/statuses lists the real ids.
const OPEN_STATUS = '1000';

export default class CreateTicket extends React.Component<ICreateTicketProps, ICreateTicketState> {

  constructor(props: ICreateTicketProps) {
    super(props);
    this.state = {
      subject: '',
      description: '',
      priority: 'MEDIUM',
      severity: 'MODERATE',
      ticketFormId: null,
      formsError: null,
      submitting: false,
      error: null,
      needsConnect: false
    };
  }

  public componentDidMount(): void {
    void this.loadTicketForm();
  }

  private proxyConfig(): { functionBaseUrl: string; functionKey: string; userEmail: string } {
    return {
      functionBaseUrl: this.props.functionBaseUrl,
      functionKey: this.props.functionKey,
      userEmail: this.props.userEmail
    };
  }

  // Creating a ticket needs the id of a ticket form. Use the one named
  // "Default" if there is one, otherwise the first form NinjaOne returns.
  private loadTicketForm = async (): Promise<void> => {
    try {
      const forms = toList(await callProxy(this.proxyConfig(), '/v2/ticketing/ticket-form'));
      const preferred = forms.filter(
        (form) => String(form.name || form.displayName || '').toLowerCase() === 'default'
      )[0] || forms[0];
      const formId = preferred ? Number(preferred.id) : NaN;

      if (isNaN(formId)) {
        this.setState({ formsError: 'Could not find a ticket form in NinjaOne.' });
        return;
      }

      this.setState({ ticketFormId: formId });
    } catch (err) {
      this.setState({ formsError: err instanceof Error ? err.message : 'Could not load the ticket form.' });
    }
  };

  private handleSubject = (event: React.ChangeEvent<HTMLInputElement>): void => {
    this.setState({ subject: event.target.value });
  };

  private handleDescription = (event: React.ChangeEvent<HTMLTextAreaElement>): void => {
    this.setState({ description: event.target.value });
  };

  private handlePriority = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    this.setState({ priority: event.target.value });
  };

  private handleSeverity = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    this.setState({ severity: event.target.value });
  };

  private submit = async (): Promise<void> => {
    const { requester, onCreated } = this.props;
    const { subject, description, priority, severity, ticketFormId } = this.state;
    const clientId = requester.clientId;

    if (typeof clientId !== 'number' || ticketFormId === null) {
      return;
    }

    this.setState({ submitting: true, error: null, needsConnect: false });

    const body = {
      clientId,
      ticketFormId,
      subject: subject.trim(),
      description: { public: true, body: description.trim() },
      status: OPEN_STATUS,
      type: 'PROBLEM',
      requesterUid: requester.uid,
      priority,
      severity
    };

    try {
      let result: unknown;

      try {
        result = await callProxy(this.proxyConfig(), '/v2/ticketing/ticket', { method: 'POST', body });
      } catch (firstError) {
        // Same split we hit with comments: if NinjaOne insists on a signed-in
        // user for this write, retry as the person's connected account.
        if (proxyErrorCode(firstError) !== 'user_context_required') {
          throw firstError;
        }
        result = await callProxy(this.proxyConfig(), '/v2/ticketing/ticket', {
          method: 'POST',
          body,
          userContext: true
        });
      }

      const created = result as JsonObject | null;
      onCreated(created ? created.id : undefined);
    } catch (err) {
      const code = proxyErrorCode(err);
      if (code === 'not_connected' || code === 'reconnect_required') {
        this.setState({ submitting: false, needsConnect: true });
      } else {
        this.setState({
          submitting: false,
          error: err instanceof Error ? err.message : 'Could not create the ticket.'
        });
      }
    }
  };

  public render(): React.ReactElement<ICreateTicketProps> {
    const { requester, onBack, userEmail, functionBaseUrl } = this.props;
    const { subject, description, priority, severity, ticketFormId, formsError, submitting, error, needsConnect } = this.state;

    const clientLinked = typeof requester.clientId === 'number';
    const canSubmit = clientLinked
      && ticketFormId !== null
      && subject.trim() !== ''
      && description.trim() !== ''
      && !submitting;

    return (
      <div className={styles.ticketDashboard}>
        <button className={styles.backButton} onClick={onBack}>← Back to tickets</button>

        <h3>Create a ticket</h3>
        <p>Submitting as <strong>{contactLabel(requester)}</strong></p>

        {!clientLinked && (
          <p className={styles.errorText}>
            This person is not linked to an organization in NinjaOne, so a ticket cannot be created for them here.
          </p>
        )}
        {formsError && <p className={styles.errorText}>{formsError}</p>}
        {error && <p className={styles.errorText}>{error}</p>}
        {needsConnect && (
          <p>
            You need to connect your NinjaOne account before creating tickets.{' '}
            <a
              href={`${functionBaseUrl.replace(/\/ninja$/, '/ninja-login')}?user=${encodeURIComponent(userEmail)}`}
              target="_blank"
              rel="noreferrer"
            >
              Connect your account
            </a>
            , then come back and submit again.
          </p>
        )}

        <div className={styles.formField}>
          <label htmlFor="ticket-subject">Subject</label>
          <input
            id="ticket-subject"
            className={styles.formInput}
            type="text"
            maxLength={200}
            value={subject}
            onChange={this.handleSubject}
          />
        </div>

        <div className={styles.formField}>
          <label htmlFor="ticket-description">Description</label>
          <textarea
            id="ticket-description"
            className={styles.formInput}
            rows={6}
            value={description}
            onChange={this.handleDescription}
          />
        </div>

        <div className={styles.formField}>
          <label htmlFor="ticket-priority">Priority</label>
          <select
            id="ticket-priority"
            className={styles.formInput}
            value={priority}
            onChange={this.handlePriority}
          >
            {PRIORITIES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        <div className={styles.formField}>
          <label htmlFor="ticket-severity">Severity</label>
          <select
            id="ticket-severity"
            className={styles.formInput}
            value={severity}
            onChange={this.handleSeverity}
          >
            {SEVERITIES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        <button onClick={() => { void this.submit(); }} disabled={!canSubmit}>
          {submitting ? 'Creating…' : 'Submit ticket'}
        </button>
      </div>
    );
  }
}

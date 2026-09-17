import * as React from 'react';
import styles from './TicketDashboard.module.scss';
import { ITicketDetailProps } from './ITicketDetailProps';
import { callProxy, renderField, formatTime, toFirstLetterCaps, ProxyError, omitQuotations } from './proxyClient';

type JsonObject = Record<string, unknown>;

interface ITicketDetailState {
  ticket: JsonObject | null;
  comments: JsonObject[];
  assignedToName: string;
  requesterName: string;
  loading: boolean;
  error: string | null;
  newComment: string;
  posting: boolean;
  needsConnect: boolean;
}

// Resolve a display name from a user/contact record, trying the field names
// NinjaOne is known to use elsewhere (displayName, name) before falling back
// to first/last name or a raw email.
function resolveDisplayName(record: JsonObject | undefined): string {
  if (!record) {
    return '';
  }
  if (typeof record.displayName === 'string') {
    return record.displayName;
  }
  if (typeof record.name === 'string') {
    return record.name;
  }
  const first = typeof record.firstName === 'string' ? record.firstName : '';
  const last = typeof record.lastName === 'string' ? record.lastName : '';
  if (first || last) {
    return `${first} ${last}`.trim();
  }
  return typeof record.email === 'string' ? record.email : '';
}

export default class TicketDetail extends React.Component<ITicketDetailProps, ITicketDetailState> {

  constructor(props: ITicketDetailProps) {
    super(props);
    this.state = {
      ticket: null,
      comments: [],
      assignedToName: '',
      requesterName: '',
      loading: true,
      error: null,
      newComment: '',
      posting: false,
      needsConnect: false
    };
  }

  public componentDidMount(): void {
    void this.loadTicket();
  }

  private proxyConfig(): { functionBaseUrl: string; functionKey: string; userEmail: string } {
    return {
      functionBaseUrl: this.props.functionBaseUrl,
      functionKey: this.props.functionKey,
      userEmail: this.props.userEmail
    };
  }

  private loadTicket = async (): Promise<void> => {
    const { ticketId } = this.props;

    try {
      const ticket = (await callProxy(this.proxyConfig(), `/v2/ticketing/ticket/${ticketId}`)) as JsonObject;

      const logEntries = (await callProxy(
        this.proxyConfig(),
        `/v2/ticketing/ticket/${ticketId}/log-entry`,
        { query: { type: 'COMMENT' } }
      )) as JsonObject[];

      // Note: assignedAppUserId is a numeric technician id, requesterUid is a
      // contact UUID — neither is a name, so resolve both against the
      // combined app-user-contact list.
      const contactsPayload = await callProxy(
        this.proxyConfig(),
        '/v2/ticketing/app-user-contact',
        { query: { pageSize: '1000' } }
      );
      const contacts: JsonObject[] = Array.isArray(contactsPayload)
        ? (contactsPayload as JsonObject[])
        : (((contactsPayload as JsonObject).data || []) as JsonObject[]);

      const assignedRecord = contacts.find((c) => c.id === ticket.assignedAppUserId);
      const requesterRecord = contacts.find((c) => c.uid === ticket.requesterUid);

      const assignedToName = resolveDisplayName(assignedRecord) || renderField(ticket.assignedAppUserId);
      const requesterName = resolveDisplayName(requesterRecord) || renderField(ticket.requesterUid);

      // A comment's author may be a technician (matched by numeric id) or an
      // end user/contact (matched by uid) — try both against the same list.
      const commentsWithAuthor = (Array.isArray(logEntries) ? logEntries : []).map((entry) => {
        const authorRecord = contacts.find(
          (c) => c.id === entry.appUserContactId || c.uid === entry.appUserContactUid
        );
        return { ...entry, authorName: resolveDisplayName(authorRecord) || 'Unknown' };
      });

      this.setState({
        ticket,
        comments: commentsWithAuthor,
        assignedToName,
        requesterName,
        loading: false
      });
    } catch (err) {
      this.setState({ loading: false, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  };

  private handleCommentChange = (event: React.ChangeEvent<HTMLTextAreaElement>): void => {
    this.setState({ newComment: event.target.value });
  };

  private postComment = async (): Promise<void> => {
    const { ticketId } = this.props;
    const { newComment } = this.state;

    if (!newComment.trim()) {
      return;
    }

    this.setState({ posting: true, error: null });

    try {
      const formData = new FormData();
      formData.append('comment', JSON.stringify({ public: true, body: newComment }));

      await callProxy(this.proxyConfig(), `/v2/ticketing/ticket/${ticketId}/comment`, {
        method: 'POST',
        body: formData,
        userContext: true
      });

      this.setState({ newComment: '', posting: false, needsConnect: false });
      void this.loadTicket(); // refresh so the new comment shows up in the list
    } catch (err) {
      if (err instanceof ProxyError && (err.code === 'not_connected' || err.code === 'reconnect_required')) {
        this.setState({ posting: false, needsConnect: true, error: null });
      } else {
        this.setState({ posting: false, error: err instanceof Error ? err.message : 'Could not post comment' });
      }
    }
  };

  public render(): React.ReactElement<ITicketDetailProps> {
    const { onBack, userEmail, functionBaseUrl } = this.props;
    const { ticket, comments, assignedToName, requesterName, loading, error, newComment, posting, needsConnect } = this.state;

    if (loading) {
      return <div className={styles.ticketDashboard}>Loading ticket…</div>;
    }

    const status = ticket ? (ticket.status as JsonObject | undefined) : undefined;

    return (
      <div className={styles.ticketDashboard}>
        <button className={styles.backButton} onClick={onBack}>← Back to tickets</button>

        {error && <p className={styles.errorText}>{error}</p>}

        {ticket && (
          <div className={styles.ticketDetail}>
            <h3>{renderField(ticket.subject)}</h3>

            <dl className={styles.fieldList}>
              <dt>ID</dt><dd>{renderField(ticket.id)}</dd>
              <dt>Created</dt><dd>{formatTime(ticket.createTime)}</dd>
              <dt>Assigned to</dt><dd>{assignedToName}</dd>
              <dt>Requester</dt><dd>{omitQuotations(requesterName)}</dd>
              <dt>Status</dt><dd>{renderField(status ? status.displayName : ticket.status)}</dd>
              <dt>Priority</dt><dd>{toFirstLetterCaps(ticket.priority)}</dd>
              <dt>Severity</dt><dd>{toFirstLetterCaps(ticket.severity)}</dd>
              <dt>Source</dt><dd>{toFirstLetterCaps(ticket.source)}</dd>
              <dt>Description</dt><dd>{renderField(ticket.description) || renderField(this.props.fallbackDescription)}</dd>
            </dl>

            <h4>Previous comments</h4>
            {comments.length === 0 && <p>No comments yet.</p>}
            <ul className={styles.commentList}>
              {comments.map((entry) => (
                <li key={renderField(entry.id)}>
                  <div className={styles.commentMeta}>{renderField(entry.authorName)} — {formatTime(entry.createTime)}</div>
                  <div>{renderField(entry.body)}</div>
                </li>
              ))}
            </ul>

            <h4>Add a comment</h4>
            {needsConnect ? (
              <p>
                You need to connect your NinjaOne account before posting comments.{' '}
                <a
                  href={`${functionBaseUrl.replace(/\/ninja$/, '/ninja-login')}?user=${encodeURIComponent(userEmail)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Connect your account
                </a>
                , then come back and try again.
              </p>
            ) : (
              <>
                <textarea
                  className={styles.commentInput}
                  value={newComment}
                  onChange={this.handleCommentChange}
                  rows={4}
                />
                <div>
                  <button onClick={() => { void this.postComment(); }} disabled={posting || !newComment.trim()}>
                    {posting ? 'Posting…' : 'Post comment'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  }
}

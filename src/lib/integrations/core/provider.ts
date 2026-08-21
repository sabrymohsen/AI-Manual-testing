/**
 * WorkItemProvider — the contract every project-management integration implements.
 *
 * Distilled from the methods the app actually calls on the legacy OpenProjectClient
 * (create/update/find/comment/attach work items, board placement, metadata, members,
 * priorities) plus inbound webhook parsing for two-way sync.
 *
 * All methods speak the normalized types in ./types. Providers are constructed by
 * the factory (./factory) from a decrypted ProjectIntegration row.
 */
import type {
  Board,
  BoardColumn,
  CustomFieldDef,
  EntityType,
  Member,
  NormalizedInboundEvent,
  Priority,
  ProviderId,
  TestConnectionResult,
  WorkItem,
  WorkItemInput,
  WorkItemStatus,
  WorkItemType,
} from "./types"

/** Resolved, decrypted connection settings handed to a provider constructor. */
export interface ProviderConnection {
  provider: ProviderId
  baseUrl: string
  /** OP slug | Jira project key | ADO project | ClickUp list id. */
  externalProjectKey: string
  /** Jira account email / ADO (unused) / etc. Empty when the provider is token-only. */
  username: string
  /** Decrypted API token / PAT / personal token. */
  apiToken: string
  /** Secret used to verify inbound webhooks, when configured. */
  webhookSecret?: string | null
}

export interface WorkItemProvider {
  readonly provider: ProviderId

  // ─── Connection & metadata ──────────────────────────────────────────────────
  testConnection(): Promise<TestConnectionResult>
  getTypes(): Promise<WorkItemType[]>
  getStatuses(): Promise<WorkItemStatus[]>
  getBoards(): Promise<Board[]>
  getBoardColumns(boardId: string): Promise<BoardColumn[]>
  getTypeCustomFields(typeId: string, opts?: { onlyRequired?: boolean }): Promise<CustomFieldDef[]>
  getMembers(): Promise<Member[]>
  getPriorities(): Promise<Priority[]>

  // ─── Work items ───────────────────────────────────────────────────────────────
  createWorkItem(input: WorkItemInput): Promise<WorkItem>
  updateWorkItem(externalId: string, input: WorkItemInput): Promise<WorkItem>
  getWorkItem(externalId: string): Promise<WorkItem>
  /** Find an existing item created by us for a local entity (via the embedded marker). */
  findByMarker(entityType: EntityType, localId: string): Promise<WorkItem | null>
  /** Search items by logical role (used by requirement import: role="userStory"). */
  searchByRole?(role: "testCase" | "bug" | "userStory"): Promise<WorkItem[]>
  deleteWorkItem(externalId: string): Promise<boolean>
  addComment(externalId: string, markdown: string): Promise<boolean>

  // ─── Attachments ──────────────────────────────────────────────────────────────
  getAttachmentNames(externalId: string): Promise<string[]>
  uploadAttachment(
    externalId: string,
    fileName: string,
    data: Buffer | Uint8Array,
    contentType: string
  ): Promise<boolean>

  // ─── Board placement (idempotent) ─────────────────────────────────────────────
  /** True if the card already appears anywhere on the board. */
  boardContains(boardId: string, externalId: string): Promise<boolean>
  /**
   * Which columns the card currently occupies, as column ids, judged by the
   * side of the board this app writes.
   *
   * Normally one. More than one is a broken state no user action can produce —
   * a placement that half-landed — and it is what lets a sync tell "the user
   * dragged this card" apart from "our placement never took". Implementations
   * must not report a column the user may simply have dragged the card to, or
   * the sync will drag it back. Optional: providers that cannot answer cheaply
   * omit it, and callers fall back to leaving the card alone.
   */
  getCardColumns?(boardId: string, externalId: string): Promise<string[]>
  /**
   * The column the TRACKER believes the card is in — the side a person's drag
   * updates, as opposed to whatever this app last wrote. Null when the tracker
   * has no opinion (card not on the board, or the provider stores position only
   * where the app already writes it).
   *
   * This is what makes a drag in the tracker visible to the app, so the app can
   * adopt the move instead of silently disagreeing with it forever. Optional.
   */
  getTrackerColumn?(boardId: string, externalId: string): Promise<string | null>

  // ─── Board creation (optional capability) ─────────────────────────────────────
  /**
   * Create a board whose columns are each filtered to one tracker status, and
   * optionally to one work-item type.
   *
   * Deliberately takes the columns it is told to make rather than deciding them:
   * which statuses deserve a column is the user's call and differs per tracker,
   * so no status vocabulary is assumed here. Providers whose boards cannot be
   * created through the API simply omit this.
   */
  createStatusBoard?(
    name: string,
    columns: Array<{ name: string; statusId: string }>,
    opts?: { typeId?: string | null }
  ): Promise<{
    boardId: string
    url: string
    columns: Array<{ name: string; statusId: string; queryId: string }>
  }>
  /**
   * Reconcile the card to sit in EXACTLY the target column (moves it out of any
   * other column, no-op if already there). Returns false when placement is not
   * permitted. Mirrors OpenProject's setBoardCardColumn semantics.
   */
  reconcileColumn(boardId: string, column: BoardColumn, externalId: string): Promise<boolean>
  /** Drop a genuinely-new card into a column without disturbing existing cards. */
  placeOnColumn(boardId: string, column: BoardColumn, externalId: string): Promise<boolean>

  // ─── Inbound (two-way sync) ───────────────────────────────────────────────────
  /** Verify a webhook request's authenticity (signature/secret). */
  verifyWebhook(headers: Record<string, string>, rawBody: string): boolean
  /** Parse a verified webhook payload into normalized inbound events. */
  parseWebhook(payload: unknown): NormalizedInboundEvent[]

  // ─── URL helpers ──────────────────────────────────────────────────────────────
  workItemUrl(externalId: string): string
  projectUrl(): string
}

/**
 * Base implementation whose every method throws "not implemented". Concrete
 * providers extend it and override what they support, which keeps skeletons
 * type-complete against WorkItemProvider while they are being built out.
 * Inbound webhook methods default to no-op (safe: provider simply won't reconcile).
 */
export abstract class BaseProvider implements WorkItemProvider {
  abstract readonly provider: ProviderId

  protected notImplemented(method: string): never {
    throw new Error(`${(this as any).provider} provider: ${method}() not implemented`)
  }

  testConnection(): Promise<TestConnectionResult> {
    return this.notImplemented("testConnection")
  }
  getTypes(): Promise<WorkItemType[]> {
    return this.notImplemented("getTypes")
  }
  getStatuses(): Promise<WorkItemStatus[]> {
    return this.notImplemented("getStatuses")
  }
  getBoards(): Promise<Board[]> {
    return this.notImplemented("getBoards")
  }
  getBoardColumns(_boardId: string): Promise<BoardColumn[]> {
    return this.notImplemented("getBoardColumns")
  }
  getTypeCustomFields(_typeId: string, _opts?: { onlyRequired?: boolean }): Promise<CustomFieldDef[]> {
    return this.notImplemented("getTypeCustomFields")
  }
  getMembers(): Promise<Member[]> {
    return this.notImplemented("getMembers")
  }
  getPriorities(): Promise<Priority[]> {
    return this.notImplemented("getPriorities")
  }
  createWorkItem(_input: WorkItemInput): Promise<WorkItem> {
    return this.notImplemented("createWorkItem")
  }
  updateWorkItem(_externalId: string, _input: WorkItemInput): Promise<WorkItem> {
    return this.notImplemented("updateWorkItem")
  }
  getWorkItem(_externalId: string): Promise<WorkItem> {
    return this.notImplemented("getWorkItem")
  }
  findByMarker(_entityType: EntityType, _localId: string): Promise<WorkItem | null> {
    return this.notImplemented("findByMarker")
  }
  deleteWorkItem(_externalId: string): Promise<boolean> {
    return this.notImplemented("deleteWorkItem")
  }
  addComment(_externalId: string, _markdown: string): Promise<boolean> {
    return this.notImplemented("addComment")
  }
  getAttachmentNames(_externalId: string): Promise<string[]> {
    return this.notImplemented("getAttachmentNames")
  }
  uploadAttachment(
    _externalId: string,
    _fileName: string,
    _data: Buffer | Uint8Array,
    _contentType: string
  ): Promise<boolean> {
    return this.notImplemented("uploadAttachment")
  }
  boardContains(_boardId: string, _externalId: string): Promise<boolean> {
    return this.notImplemented("boardContains")
  }
  reconcileColumn(_boardId: string, _column: BoardColumn, _externalId: string): Promise<boolean> {
    return this.notImplemented("reconcileColumn")
  }
  placeOnColumn(_boardId: string, _column: BoardColumn, _externalId: string): Promise<boolean> {
    return this.notImplemented("placeOnColumn")
  }
  verifyWebhook(_headers: Record<string, string>, _rawBody: string): boolean {
    return false
  }
  parseWebhook(_payload: unknown): NormalizedInboundEvent[] {
    return []
  }
  workItemUrl(_externalId: string): string {
    return this.notImplemented("workItemUrl")
  }
  projectUrl(): string {
    return this.notImplemented("projectUrl")
  }
}

/** Invalidating happens when input changes, before a debounced request starts. */
export class LatestRequest {
  private epoch = 0;
  private controller: AbortController | null = null;
  invalidate() { this.epoch++; this.controller?.abort(); this.controller = null; }
  begin() {
    this.invalidate();
    this.controller = new AbortController();
    return { epoch: this.epoch, signal: this.controller.signal };
  }
  isCurrent(ticket: { epoch: number }) { return ticket.epoch === this.epoch; }
}

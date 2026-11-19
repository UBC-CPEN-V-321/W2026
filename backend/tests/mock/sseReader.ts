export interface StreamedEvent {
  event: string;
  data: unknown;
}

// Reads a text/event-stream response one event at a time, skipping heartbeat comments
export class EventReader {
  private buffer = "";
  private readonly decoder = new TextDecoder();

  constructor(private readonly reader: ReadableStreamDefaultReader<Uint8Array>) {}

  async next(): Promise<StreamedEvent> {
    for (;;) {
      const end = this.buffer.indexOf("\n\n");
      if (end >= 0) {
        const block = this.buffer.slice(0, end);
        this.buffer = this.buffer.slice(end + 2);
        const event = parseEventBlock(block);
        if (event) return event;
        continue;
      }
      const { done, value } = await this.reader.read();
      if (done) throw new Error("The stream ended");
      this.buffer += this.decoder.decode(value, { stream: true });
    }
  }
}

function parseEventBlock(block: string): StreamedEvent | null {
  let event = "message";
  let data = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice("event: ".length);
    if (line.startsWith("data: ")) data += line.slice("data: ".length);
  }
  return data === "" ? null : { event, data: JSON.parse(data) as unknown };
}


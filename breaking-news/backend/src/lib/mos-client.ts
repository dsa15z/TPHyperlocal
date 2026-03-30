// @ts-nocheck
import net from 'node:net';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MOSConfig {
  host: string;
  port: number;
  ncsID: string;
  mosID: string;
}

export interface RundownItem {
  itemID: string;
  slug: string;
  abstract: string;
  duration: number;
  script?: string;
  backTime?: string;
}

// ─── Simple Logger ──────────────────────────────────────────────────────────

const log = {
  info: (msg: string, data?: any) => console.log(`[mos-client] ${msg}`, data ?? ''),
  warn: (msg: string, data?: any) => console.warn(`[mos-client] ${msg}`, data ?? ''),
  error: (msg: string, data?: any) => console.error(`[mos-client] ${msg}`, data ?? ''),
};

// ─── XML Escape ─────────────────────────────────────────────────────────────

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─── MOS XML Message Builders ───────────────────────────────────────────────

export function buildRoCreate(
  mosID: string,
  ncsID: string,
  rundownId: string,
  slug: string,
  items: RundownItem[],
): string {
  const startTime = new Date().toISOString();
  const storiesXml = items
    .map(
      (item) => `
    <roStory>
      <storyID>${escapeXml(item.itemID)}</storyID>
      <storySlug>${escapeXml(item.slug)}</storySlug>
      <storyNum>${item.duration}</storyNum>
      <storyBody>
        <p>${escapeXml(item.script || item.abstract)}</p>
      </storyBody>
    </roStory>`,
    )
    .join('');

  return `<mos>
  <mosID>${escapeXml(mosID)}</mosID>
  <ncsID>${escapeXml(ncsID)}</ncsID>
  <roCreate>
    <roID>${escapeXml(rundownId)}</roID>
    <roSlug>${escapeXml(slug)}</roSlug>
    <roEdStart>${startTime}</roEdStart>${storiesXml}
  </roCreate>
</mos>\n`;
}

export function buildItemReplace(
  mosID: string,
  ncsID: string,
  rundownId: string,
  item: RundownItem,
): string {
  return `<mos>
  <mosID>${escapeXml(mosID)}</mosID>
  <ncsID>${escapeXml(ncsID)}</ncsID>
  <roElementAction operation="REPLACE">
    <roID>${escapeXml(rundownId)}</roID>
    <element_target>
      <storyID>${escapeXml(item.itemID)}</storyID>
    </element_target>
    <element_source>
      <roStory>
        <storyID>${escapeXml(item.itemID)}</storyID>
        <storySlug>${escapeXml(item.slug)}</storySlug>
        <storyNum>${item.duration}</storyNum>
        <storyBody>
          <p>${escapeXml(item.script || item.abstract)}</p>
        </storyBody>
      </roStory>
    </element_source>
  </roElementAction>
</mos>\n`;
}

function buildRoElementDelete(
  mosID: string,
  ncsID: string,
  rundownId: string,
  itemId: string,
): string {
  return `<mos>
  <mosID>${escapeXml(mosID)}</mosID>
  <ncsID>${escapeXml(ncsID)}</ncsID>
  <roElementAction operation="DELETE">
    <roID>${escapeXml(rundownId)}</roID>
    <element_target>
      <storyID>${escapeXml(itemId)}</storyID>
    </element_target>
  </roElementAction>
</mos>\n`;
}

// ─── TCP Transport ──────────────────────────────────────────────────────────

const CONNECTION_TIMEOUT = 10_000;
const RESPONSE_TIMEOUT = 10_000;

function sendMosMessage(
  config: MOSConfig,
  message: string,
): Promise<{ success: boolean; response?: string; error?: string }> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let responseData = '';
    let resolved = false;

    const finish = (result: { success: boolean; response?: string; error?: string }) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve(result);
    };

    // Connection timeout
    socket.setTimeout(CONNECTION_TIMEOUT);

    socket.on('timeout', () => {
      log.warn('TCP connection timed out', { host: config.host, port: config.port });
      finish({ success: false, error: 'Connection timed out' });
    });

    socket.on('error', (err: Error) => {
      const code = (err as any).code;
      if (code === 'ECONNREFUSED') {
        log.warn('Connection refused — ENPS/iNews server not available', {
          host: config.host,
          port: config.port,
        });
        finish({
          success: false,
          error: `Connection refused: ${config.host}:${config.port} — verify ENPS/iNews is running and accepting MOS connections`,
        });
      } else {
        log.error('TCP socket error', { error: err.message });
        finish({ success: false, error: err.message });
      }
    });

    socket.on('data', (chunk: Buffer) => {
      responseData += chunk.toString('utf8');
      // Check if we got a complete MOS acknowledgment
      if (responseData.includes('</mos>')) {
        const isAck =
          responseData.includes('<roAck>') ||
          responseData.includes('<mosAck>');
        if (isAck) {
          log.info('Received MOS acknowledgment');
          finish({ success: true, response: responseData });
        } else {
          log.warn('Received non-ack MOS response', { response: responseData.slice(0, 500) });
          // Check for explicit NACK
          if (responseData.includes('<mosNAck>') || responseData.includes('<roNAck>')) {
            finish({ success: false, error: 'Server returned NACK', response: responseData });
          } else {
            // Treat any complete </mos> response as success if not explicit error
            finish({ success: true, response: responseData });
          }
        }
      }
    });

    socket.on('close', () => {
      if (!resolved) {
        if (responseData.length > 0) {
          finish({ success: true, response: responseData });
        } else {
          finish({ success: false, error: 'Connection closed without response' });
        }
      }
    });

    // Connect and send
    socket.connect(config.port, config.host, () => {
      log.info('Connected to MOS server', { host: config.host, port: config.port });
      socket.write(message, 'utf8');

      // Response timeout after sending
      setTimeout(() => {
        if (!resolved) {
          log.warn('No MOS response within timeout');
          finish({
            success: false,
            error: 'No response received within timeout',
            response: responseData || undefined,
          });
        }
      }, RESPONSE_TIMEOUT);
    });
  });
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function pushRundown(
  config: MOSConfig,
  rundownId: string,
  items: RundownItem[],
): Promise<{ success: boolean; error?: string }> {
  log.info('Pushing rundown via MOS', { rundownId, itemCount: items.length });

  const slug = `Rundown ${rundownId}`;
  const message = buildRoCreate(config.mosID, config.ncsID, rundownId, slug, items);
  const result = await sendMosMessage(config, message);

  if (result.success) {
    log.info('Rundown pushed successfully', { rundownId });
  } else {
    log.error('Failed to push rundown', { rundownId, error: result.error });
  }

  return { success: result.success, error: result.error };
}

export async function updateRundownItem(
  config: MOSConfig,
  rundownId: string,
  item: RundownItem,
): Promise<{ success: boolean; error?: string }> {
  log.info('Updating rundown item via MOS', { rundownId, itemID: item.itemID });

  const message = buildItemReplace(config.mosID, config.ncsID, rundownId, item);
  const result = await sendMosMessage(config, message);

  if (result.success) {
    log.info('Rundown item updated successfully', { rundownId, itemID: item.itemID });
  } else {
    log.error('Failed to update rundown item', { rundownId, itemID: item.itemID, error: result.error });
  }

  return { success: result.success, error: result.error };
}

export async function deleteRundownItem(
  config: MOSConfig,
  rundownId: string,
  itemId: string,
): Promise<{ success: boolean; error?: string }> {
  log.info('Deleting rundown item via MOS', { rundownId, itemId });

  const message = buildRoElementDelete(config.mosID, config.ncsID, rundownId, itemId);
  const result = await sendMosMessage(config, message);

  if (result.success) {
    log.info('Rundown item deleted successfully', { rundownId, itemId });
  } else {
    log.error('Failed to delete rundown item', { rundownId, itemId, error: result.error });
  }

  return { success: result.success, error: result.error };
}

// ─── Connection Test ────────────────────────────────────────────────────────

export function testConnection(
  host: string,
  port: number,
): Promise<{ success: boolean; latencyMs: number; error?: string }> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();
    let resolved = false;

    const finish = (result: { success: boolean; latencyMs: number; error?: string }) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(CONNECTION_TIMEOUT);

    socket.on('timeout', () => {
      finish({ success: false, latencyMs: Date.now() - startTime, error: 'Connection timed out' });
    });

    socket.on('error', (err: Error) => {
      const code = (err as any).code;
      const errorMsg =
        code === 'ECONNREFUSED'
          ? `Connection refused: ${host}:${port}`
          : err.message;
      finish({ success: false, latencyMs: Date.now() - startTime, error: errorMsg });
    });

    socket.connect(port, host, () => {
      const latencyMs = Date.now() - startTime;
      log.info('MOS connection test successful', { host, port, latencyMs });
      finish({ success: true, latencyMs });
    });
  });
}

// Local DOM and manager-record identifiers, never authentication or security tokens.
// No Web Crypto dependency: randomUUID may be absent on HTTP LAN/IP installations.
const instance = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
let sequence = 0;
export function createId(prefix = 'ue') {
    sequence += 1;
    return `${prefix}-${instance}-${sequence.toString(36)}`;
}

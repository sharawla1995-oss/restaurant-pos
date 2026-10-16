// Server-side only, isolated Top Chicken Central <-> Beta transport.
// Never put TC_BRIDGE_HMAC_KEY, Central service key, or a signed payload in clients.
const KEY=/^[a-f0-9]{64}$/i;
const HEX=/^[a-f0-9]{64}$/i;
function hex(bytes){return Array.from(bytes,v=>v.toString(16).padStart(2,'0')).join('')}
function fromHex(str){if(!HEX.test(String(str)))throw Error('BAD_HMAC_SIGNATURE');return new Uint8Array(str.match(/../g).map(x=>parseInt(x,16)))}
export function requireBridgeKey(secret){if(typeof secret!=='string'||!KEY.test(secret))throw Error('TC_BRIDGE_HMAC_KEY_REQUIRED')}
async function keyFor(secret){requireBridgeKey(secret);return crypto.subtle.importKey('raw',fromHex(secret),'HMAC',false,['sign','verify'])}
export async function signBody(secret,body){if(typeof body!=='string'||body.length>32000)throw Error('TC_BRIDGE_BODY_INVALID');return hex(new Uint8Array(await crypto.subtle.sign('HMAC',await keyFor(secret),new TextEncoder().encode(body))))}
export async function verifyBody(secret,body,sig){if(typeof body!=='string'||body.length>32000||!HEX.test(String(sig)))return false;return crypto.subtle.verify('HMAC',await keyFor(secret),fromHex(sig),new TextEncoder().encode(body))}
export function withinSeconds(iso,now=new Date(),seconds=5){if(typeof iso!=='string')return false;const at=Date.parse(iso);return Number.isFinite(at)&&Math.abs(now.getTime()-at)<=seconds*1000}

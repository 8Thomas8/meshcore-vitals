# Spike: connecting to a MeshCore node from the browser

Date: 2026-09-22 · Spike code: PR #2 (closed without merging), page
`app/pages/spike.vue`

## Question

Can a browser talk to a MeshCore companion node, and what link-quality data
comes back?

## Test setup

- Node: companion firmware on the EU 869 MHz band, 62.5 kHz bandwidth.
- Library: `@liamcottle/meshcore.js` 1.15.0.
- Transport tested: **Web Bluetooth** (Chrome on the developer's machine).
- Web Serial: not tested against a node. Chrome under WSL exposes
  `navigator.serial` but not `navigator.bluetooth`, and WSL sees no USB port.

## Short answer

**Yes.** Web Bluetooth connected on the first try, and the node returns enough
data for a first version of "vitals", including per-hop SNR in both directions
through `tracePath`.

## Data returned

| Call | Useful data |
|---|---|
| `getSelfInfo` | name, public key, position, radio config, TX power |
| `getStatsCore` | battery (mV), uptime (s), queue length |
| `getStatsRadio` | noise floor, last RSSI/SNR, TX/RX airtime |
| `getStatsPackets` | received/sent (flood/direct), receive errors |
| `getContacts` | name, type, position, last advert, known path |
| `LogRxData` push | SNR/RSSI **for every received packet** + raw bytes |

Derived directly from these:

- **Receive error rate**: errors / (received + errors). About 12% in the test.
- **Duty cycle**: TX and RX airtime over uptime.
- **Link margin**: last RSSI minus noise floor.
- **Live feed**: `LogRxData` arrives unprompted for every packet heard. Once
  the raw bytes are decoded (packet type, path), it can feed SNR/RSSI charts
  over time and per neighbour.

## Format details

- Coordinates are integers × 10⁶.
- `radioFreq` is in kHz, `radioBw` in Hz.
- Contact types: 1 = chat, 2 = repeater, 3 = room server.
- `outPathLen`:
  - `-1`: no known path (the node floods)
  - `0`: direct neighbour
  - otherwise an encoded byte: the low 6 bits are the hop count, the top 2 bits
    the hash size per hop minus one. Example: `65` = `0x41` means 1 hop with a
    2-byte hash, and those 2 bytes are the first bytes of the repeater's public
    key. The mesh used for the test runs 2-byte path hashes.
- Timestamps (`lastAdvert`, `lastMod`) come from the advertising node's clock
  and can be wrong by years.
- `Uint8Array` fields serialize poorly to JSON (`"12,34,…"`): convert them to
  hex for display and keys.

## Per-hop trace (`tracePath`)

**It works**, as long as the path is valid.

First attempt: 12 failures in under a second, all rejecting with `undefined`.
In meshcore.js that is a rejection with no reason on the firmware's `Err`
response: the command is refused before anything is transmitted. The spike was
sending invalid paths:

- contacts with `outPathLen = -1` or `0` → empty path: a trace must follow an
  explicit path. It cannot flood.
- a contact with `outPathLen = 65` → all 64 bytes of the buffer, zeros included.

Rule that works (meshcore.js 1.15 sends `flags = 0`, i.e. 1 byte per hop):

- `outPathLen < 0`: no trace possible
- `outPathLen = 0` (direct neighbour): `[publicKey[0]]`
- otherwise: the first byte of each hop's hash, after decoding `outPathLen`.

Second attempt, to a neighbouring repeater with its 1-byte hash as the path:
`TraceData` push received within milliseconds.

```json
{ "pathLen": 1, "pathSnrs": "55", "lastSnr": 12.25 }
```

- `pathSnrs`: SNR × 4 as a signed byte, measured by each hop on the way out.
  Here 55 → **13.75 dB** (the repeater hears our node).
- `lastSnr`: SNR of the return leg as measured by our node, **12.25 dB**.
- So we get the quality of each hop **in both directions**.

The return packet also shows up as `LogRxData`. Its raw bytes decode as:
header `0x26` (direct route, payload type 9 = TRACE), path length, one SNR
byte per hop, little-endian tag, auth code, flags, then the path hashes. Two
`LogRxData` packets from the first attempt had the same shape, so they were
traces sent by another node through the same repeater.

## Decisions

- **Transport**: Web Bluetooth first (works, no cable). Web Serial second, to be
  tested on a machine with USB access before we rely on it.
- **Library**: keep `@liamcottle/meshcore.js`. It covers everything tested. It
  ships no types, so we keep and extend `app/types/meshcore.d.ts`.
- **Browsers**: Chromium only (Firefox and Safari have no Web Bluetooth). The
  app must say so clearly.

## Open questions

1. Trace through a repeater to a further contact: not tried yet.
2. 2-byte path hashes: truncating each hop to 1 byte worked here, but two
   repeaters can share that first byte. Tracing with 2-byte hashes probably
   goes through the command's `flags` field, which meshcore.js 1.15 does not
   expose.
3. Web Serial against a real node.
4. A sensible stats refresh rate that does not burden the node.

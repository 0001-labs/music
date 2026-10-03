# Plugin constraints

Status: proposed architecture. The current prototype has no plugin loader or sandbox.

Music is an open-source grid player by 0001. Plugins add instruments, audio effects, or loop generators while the host owns tracks, timing, arrangement, and the interface.

## Extension boundary

- A plugin implements one declared role: `instrument`, `effect`, or `generator`.
- Its manifest declares a unique ID, name, version, SPDX license identifier, host API version, entry points, capabilities, and bounded parameters.
- The host validates manifests, parameter ranges, event payloads, buffer sizes, and channel counts before installation or execution.
- API compatibility is versioned. Reject unsupported versions with a clear message; never silently run incompatible code.

## Interface constraints

- Each track is one 20px-high row, with an 80×20px name chip and a horizontal waveform timeline. The host owns the grid geometry and arrangement playback.
- Plugins declare controls using host-provided sliders, choices, toggles, and numeric inputs. The host renders them with Music's grid, spacing, typography, and white/ink palette.
- No arbitrary HTML, CSS, DOM access, overlays, global shortcuts, or replacement of transport controls.
- Plugins cannot change other tracks, master output, project ownership, or the app's branding.
- Waveforms and playback state come from host-owned audio data, never decorative or misleading plugin output.

## Permissions and isolation

- Deny network, filesystem, clipboard, device access, persistent storage, and credentials by default.
- Microphone and MIDI input require a declared capability, an explicit user grant, and revocation controls. Browser device permission remains a separate user action.
- Separate untrusted control code from the host using an isolated origin and a restrictive Content Security Policy. A worker alone is not a network or security sandbox.
- Use a validated message protocol for communication. Do not expose host objects or execute plugin HTML in the app origin.
- Define a separate sandbox strategy for audio processing before third-party DSP ships. The AudioWorklet API alone is not proof of isolation.
- No remote code loading or silent plugin updates. Installation and updates use a pinned package version and integrity hash.

## Audio constraints

- The host owns tempo, sample rate, transport, quantization, and scheduling. A plugin responds to host-clock events and cannot start an independent clock.
- Start with stereo at most, fixed-size blocks, finite samples, bounded output amplitude, and a fixed parameter/event budget.
- Real-time processors cannot block, fetch, allocate unbounded memory, or grow buffers without a declared bound.
- Profile processing and memory on supported devices before choosing numerical budgets. Define bypass thresholds and maximum supported plugin count from those measurements.
- Host gain and limiting remain outside plugin control. Invalid samples, an error, a stall, or a budget breach bypasses the offending plugin and keeps the rest of the session usable.
- Offline generation is cancellable and bounded by duration and output size. It cannot monopolize the audio thread.

## Open-source contract

- Music's code and original bundled samples are MIT licensed.
- Require an SPDX license for each plugin and a separate license declaration for bundled samples. Open distribution in the official catalog requires an open-source license and a public source URL.
- Plugin authors keep their own copyright and licenses; installation does not relicense their code.
- Include small reference plugins and a documented SDK. State that package review reduces risk but does not establish sandbox security.

## Implementation order

1. Freeze the manifest, role boundaries, typed message protocol, and declarative parameter schema.
2. Build two host-owned reference plugins: an instrument and an effect. They establish the interface, not a third-party trust boundary.
3. Implement and verify isolation, permission denial/revocation, malicious payload rejection, crash recovery, and audio/memory limits.
4. Only then expose local third-party package installation with pinned versions and integrity checks.
5. Add a reviewed public catalog after install, update, license, compatibility, and failure behavior are established.

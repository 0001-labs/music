# Music by 0001

A small open-source arrangement player prototype inspired by Ezo and Live. Six tracks run horizontally in 20px-high rows. A seventh track runs vertically underneath in an 80px-wide lane (four grid squares). Each has an 80×20px name chip overlaid on the first four grid squares of its waveform lane, revealed on hover or keyboard focus. There is no separate name column or extra name row. The waveforms are measured from real audio.

[Play Music](https://music.0001.dev) · [Source code](https://github.com/0001-labs/music)

Open the published site, or run `python3 -m http.server 8000 --directory dist` from this folder.

Play runs through the eight-bar arrangement from left to right and down the vertical Pulse lane, then loops back to the beginning. Both orientations share one clock. Each playing, audible track has its own one-pixel playhead inside its waveform lane, with no square marker. Muted and excluded tracks show no playhead. Click a waveform to seek. There is no numbered ruler. Playback and timing controls sit together without gaps in the upper-right corner. Hover a track to reveal its name and the 16×16px M/S split control inside the overlaid chip. M mutes a track; S solos it. Active M/S buttons remain visible after the pointer leaves. Keyboard focus also reveals it, and touch devices keep it visible. Tempo runs from 70–160 BPM. Space plays and pauses; Stop resets the position. All state stays in memory. The working surface contains only the transport and arrangement, with no footer.

Includes 28 original synthesized WAV loops. The seven tracks are Kick, Snare, Hats, Bass, Keys, Air, and Pulse. Source tempo is 112 BPM, in A minor. Waveforms show measured amplitude peaks. Tempo changes alter pitch along with playback speed in this first prototype.

Regenerate the audio with `python3 scripts/generate_audio.py`. The generator uses only Python's standard library. The app runs directly as static HTML, CSS, and JavaScript, with no build step or external runtime dependencies.

## Plugins

The plugin system is planned; this prototype does not load third-party code. See [the plugin constraints](docs/plugins.md) for the proposed boundary and implementation order.

## License

Code, original audio loops, and the Music box artwork are available under the [MIT license](LICENSE), copyright 2026 0001. No proprietary font files are bundled. The app uses system sans-serif fonts.

This is a disposable first prototype for evaluating the grid interaction, not a production sequencer.

Deploy with `wrangler deploy`. Cloudflare serves the static app and original audio at music.0001.dev.

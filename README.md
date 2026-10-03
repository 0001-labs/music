# Music by 0001

A small open-source grid player prototype inspired by Ezo. Each row is a track; each square launches an original two-bar loop with a waveform measured from its audio.

[Play Music](https://music-grid.jaa90607124.chatgpt.site) · [Source code](https://github.com/0001-labs/music)

Open the published site, or run `python3 -m http.server 8000 --directory dist` from this folder.

Play starts the mix. Click a clip or a numbered scene to queue a change on the next bar. M mutes a track; S solos it. Tempo runs from 70–160 BPM. Space plays and pauses; Stop resets the position. All state stays in memory.

Includes 24 original synthesized WAV loops. The six tracks are Kick, Snare, Hats, Bass, Keys, and Air. Source tempo is 112 BPM, in A minor. Waveforms show measured amplitude peaks. Tempo changes alter pitch along with playback speed in this first prototype.

Regenerate the audio with `python3 scripts/generate_audio.py`. The generator uses only Python's standard library. The app runs directly as static HTML, CSS, and JavaScript, with no build step or external runtime dependencies.

## Plugins

The plugin system is planned; this prototype does not load third-party code. See [the plugin constraints](docs/plugins.md) for the proposed boundary and implementation order.

## License

Code, original audio loops, and the Music box artwork are available under the [MIT license](LICENSE), copyright 2026 0001. No proprietary font files are bundled. The app uses system sans-serif fonts.

This is a disposable first prototype for evaluating the grid interaction, not a production sequencer.

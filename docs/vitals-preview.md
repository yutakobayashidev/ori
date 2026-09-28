# Vitals reference preview

`/vitals` recreates the Body and Environment screenshots attached to
[Alan Shiflett’s post](https://x.com/AlanShiflett/status/2103524300158366183).
The shared sidebar opens it as Vitals. Body categories and history, environment
metric details, chart period/series selection, and simulated climate controls
are interactive. Other screenshot navigation entries open a preview explanation.

All scores, classifications, dates, readings, and connection indicators are
reference/demo values, not the user's health or device data. No clinical
assessment, data sync, or device command is performed. Obscured reference text
remains a visual placeholder, not inferred medical content.

`public/vitals/body-reference.jpg` is the post's second public image, retained
as the anatomy illustration source and clipped in CSS. Source media:
https://pbs.twimg.com/media/HTE4JWFWUAAnPBt.jpg
The rest of the interface is HTML/CSS with SVG data charts. Reference-specific
colors are scoped to `--vital-*` tokens in `vitals.css`.

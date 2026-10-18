# Music Studio visual assets

The directory uses the supplied Mozart Techniques Music Studio reference: red
outline icons, ivory and blush surfaces, frosted cards and red gradient controls.
Each tool has its own hash URL; the directory does not start any tool on load.
The `role=student` query selects the Student tools label for web and mobile.

## Background

Project asset: `src/studio-background.png`, copied by the build into
`public/teaching-tools/studio-background.png`.

Created with the built-in image-generation tool from the user's supplied design.
Prompt: Remove all text, buttons, tool cards, the white metronome panel and footer
UI from the supplied reference. Reconstruct the pale ivory and blush backdrop.
Preserve the red and black headphones on the piano keyboard at the upper right,
translucent musical staff and pink notes, red satin folds at the lower edges and
sheet music at the lower right. Keep the original red, blush and ivory palette
and leave clean negative space for real HTML text and controls. No logos or UI.

## Typeface

Science Gothic by Font Detective LLC, Copyright 2024, distributed under the SIL
Open Font License 1.1. Self-hosted regular, bold and black weights are included
in `src/fonts/`, with the original license in `src/fonts/OFL.txt`. The build
copies the fonts and license to the public studio folder. No font API is needed.

#!/bin/bash

docker run --rm \
    -v $(pwd):/vhs \
    --entrypoint="" \
    ghcr.io/charmbracelet/vhs \
    sh -c "apt-get update > /dev/null 2>&1 && apt-get install -y nano nodejs npm > /dev/null 2>&1 && ln -sf /bin/true /usr/local/bin/xdg-open && vhs terminal.tape"

FADE=0.5
BROWSER_DURATION=10

# GIF → video
ffmpeg -y -i terminal.gif -vf "fps=24,scale=1280:720" -c:v libx264 -pix_fmt yuv420p terminal.mp4

# Screenshot → clip
ffmpeg -y -loop 1 -i screenshot-dark.png -vf "fps=24,scale=1280:720" -t $BROWSER_DURATION -c:v libx264 -pix_fmt yuv420p screenshot-dark.mp4

# Get terminal duration to compute xfade offset
TERMINAL_DURATION=$(ffprobe -v error -select_streams v:0 -show_entries stream=duration -of csv=p=0 terminal.mp4)
OFFSET=$(echo "$TERMINAL_DURATION - $FADE" | bc)

# Crossfade → palette → GIF (play once)
ffmpeg -y -i terminal.mp4 -i screenshot-dark.mp4 \
    -filter_complex "
        [0:v][1:v]xfade=transition=fade:duration=${FADE}:offset=${OFFSET}[xf];
        [xf]split[s0][s1];
        [s0]palettegen=stats_mode=full[p];
        [s1][p]paletteuse=dither=bayer[out]
    " \
    -map "[out]" -loop -1 demo.gif

rm -f terminal.mp4 screenshot-dark.mp4

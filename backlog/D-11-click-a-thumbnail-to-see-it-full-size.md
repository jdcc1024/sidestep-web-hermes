# Issue: Click A Thumbnail To See It Full Size

## Status: done

## Phase: phase-2

## Type: improvement

## Description

A design's artwork is currently only ever shown small. The order page's Design
card renders it as a 56px square, and a gallery block crops every image to a
square thumbnail. Neither can be enlarged, so the one thing a captain most
wants to do with a mockup — look at it — is the one thing the page won't let
them do.

Give both surfaces a lightbox: click the picture, see it full size, press
Escape or click away to dismiss.

Both places want the same behaviour, so the dialog lives in one shared
component rather than being written twice.

## Acceptance Criteria

- [x] Clicking the design thumbnail in an order page Design card opens the
      image full size
- [x] Clicking an image in a gallery block opens it full size
- [x] The lightbox is keyboard reachable and closes on Escape
- [x] Thumbnails with no renderable image (no files, a print template, a stale
      URL) stay non-interactive — there is nothing to enlarge
- [x] Thumbnails that sit inside a card-wide link (portal dashboard, designs
      list) do not become nested interactive elements
- [x] Tests pass

## Dependencies

- Blocked by: none

## Notes

`DesignThumbnail` is shared by four surfaces, two of which wrap the whole card
in a `<Link>`. A button inside an anchor is invalid HTML, so zoom must be
opt-in per caller rather than on by default.

Gallery images render through `DesignBlockBody`, which the block editor also
uses for its read-only preview — the lightbox comes along for free there, which
is what you'd want while editing a brief.

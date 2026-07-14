"""Generate simple calming gradient-circle PNG icons with no external deps."""
import struct
import zlib
import math

def make_png(path, size):
    # Colors: soft teal -> lavender diagonal gradient background,
    # with a minimal white "breathing ring" (open circle) in the center.
    c1 = (74, 158, 168)   # teal
    c2 = (150, 130, 200)  # lavender
    cx, cy = size / 2, size / 2
    ring_r = size * 0.30
    ring_w = size * 0.055
    dot_r = size * 0.045

    rows = []
    for y in range(size):
        row = bytearray()
        row.append(0)  # filter type: none
        for x in range(size):
            t = (x + y) / (2 * size)  # diagonal gradient factor
            r = int(c1[0] + (c2[0] - c1[0]) * t)
            g = int(c1[1] + (c2[1] - c1[1]) * t)
            b = int(c1[2] + (c2[2] - c1[2]) * t)

            dx, dy = x - cx, y - cy
            dist = math.hypot(dx, dy)

            a = 255
            # rounded-square mask (super-ellipse) for the icon silhouette
            n = 4
            edge = size * 0.5
            se = (abs(dx) / edge) ** n + (abs(dy) / edge) ** n
            if se > 1:
                a = 0

            # breathing ring (white, soft)
            ring_dist = abs(dist - ring_r)
            if ring_dist < ring_w / 2:
                mix = 1 - (ring_dist / (ring_w / 2))
                r = int(r + (255 - r) * mix)
                g = int(g + (255 - g) * mix)
                b = int(b + (255 - b) * mix)

            # small dot at top of ring (like a single breath mark)
            ang = -math.pi / 2
            dot_x = cx + ring_r * math.cos(ang)
            dot_y = cy + ring_r * math.sin(ang)
            dot_dist = math.hypot(x - dot_x, y - dot_y)
            if dot_dist < dot_r:
                r, g, b = 255, 255, 255

            row += bytes((r, g, b, a))
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff))

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    idat = zlib.compress(raw, 9)
    png = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)

if __name__ == "__main__":
    import os
    out_dir = os.path.join(os.path.dirname(__file__), "icons")
    make_png(os.path.join(out_dir, "icon-192.png"), 192)
    make_png(os.path.join(out_dir, "icon-512.png"), 512)
    make_png(os.path.join(out_dir, "apple-touch-icon.png"), 180)
    make_png(os.path.join(out_dir, "favicon-32.png"), 32)
    print("done")

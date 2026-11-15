import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const port = Number(process.env.PORT || 7438);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".woff2": "font/woff2",
};
http
  .createServer((req, res) => {
    let name;
    try {
      name = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const target = path.resolve(
      root,
      "." + (name.endsWith("/") ? name + "index.html" : name),
    );
    if (!target.startsWith(root + path.sep) || /(?:^|\/)\./.test(name)) {
      res.writeHead(403).end();
      return;
    }
    fs.stat(target, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404).end("Not found");
        return;
      }
      const headers = {
        "Content-Type":
          mime[path.extname(target)] || "application/octet-stream",
        "Cache-Control": "no-cache",
        "Accept-Ranges": "bytes",
      };
      const range = req.headers.range;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        let start = match?.[1] ? Number(match[1]) : 0;
        let end = match?.[2] ? Number(match[2]) : stat.size - 1;
        if (match && !match[1] && match[2]) {
          start = Math.max(0, stat.size - end);
          end = stat.size - 1;
        }
        end = Math.min(end, stat.size - 1);
        if (!match || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) {
          res.writeHead(416, { ...headers, 'Content-Range': `bytes */${stat.size}` }).end();
          return;
        }
        res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
        if (req.method === 'HEAD') res.end();
        else fs.createReadStream(target, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { ...headers, 'Content-Length': stat.size });
        if (req.method === 'HEAD') res.end();
        else fs.createReadStream(target).pipe(res);
      }
    });
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`Local: http://127.0.0.1:${port}`),
  );

import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import Icon from "./icons";

export function PdfViewer({ url }) {
  const canvas = useRef(null),
    holder = useRef(null);
  const [doc, setDoc] = useState(null),
    [page, setPage] = useState(1),
    [zoom, setZoom] = useState(1),
    [width, setWidth] = useState(700);
  const [error, setError] = useState(""),
    [rendering, setRendering] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false,
      task;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
        if (disposed) return;
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const result = await fetch(url, {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        if (result.status === 401)
          window.dispatchEvent(new Event("session-expired"));
        if (!result.ok)
          throw new Error(
            "Unable to open PDF. Close and reopen this item to refresh access.",
          );
        const data = new Uint8Array(await result.arrayBuffer());
        if (disposed) return;
        task = pdfjs.getDocument({
          data,
          isEvalSupported: false,
          enableXfa: false,
          useWasm: false,
          cMapUrl: "/pdf-assets/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdf-assets/standard_fonts/",
        });
        const document = await task.promise;
        if (!disposed) setDoc(document);
      } catch (e) {
        if (!disposed) {
          setError(e.message);
          setRendering(false);
        }
      }
    })();
    return () => {
      disposed = true;
      controller.abort();
      task?.destroy();
    };
  }, [url]);
  useEffect(() => {
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(200, entries[0].contentRect.width - 32)),
    );
    if (holder.current) observer.observe(holder.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!doc) return;
    let cancelled = false,
      task;
    setRendering(true);
    setError("");
    (async () => {
      try {
        const pdfPage = await doc.getPage(page);
        if (cancelled) return;
        const viewport = pdfPage.getViewport({
          scale:
            Math.min(width / pdfPage.getViewport({ scale: 1 }).width, 1.5) *
            zoom,
        });
        const target = canvas.current,
          pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        target.width = Math.floor(viewport.width * pixelRatio);
        target.height = Math.floor(viewport.height * pixelRatio);
        target.style.width = `${viewport.width}px`;
        target.style.height = `${viewport.height}px`;
        task = pdfPage.render({
          canvasContext: target.getContext("2d"),
          viewport,
          transform: [pixelRatio, 0, 0, pixelRatio, 0, 0],
        });
        await task.promise;
        if (!cancelled) setRendering(false);
      } catch (e) {
        if (!cancelled && e.name !== "RenderingCancelledException") {
          setError(
            "This PDF page could not be rendered. Try another page or contact the administrator.",
          );
          setRendering(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, width, zoom]);
  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar">
        <button
          className="btn small"
          onClick={() => setPage((p) => p - 1)}
          disabled={!doc || page === 1}
        >
          Previous
        </button>
        <span>
          Page {page} / {doc?.numPages || "—"}
        </span>
        <button
          className="btn small"
          onClick={() => setPage((p) => p + 1)}
          disabled={!doc || page === doc.numPages}
        >
          Next
        </button>
        <label className="zoom">
          Zoom{" "}
          <select
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          >
            <option value="1">Fit width</option>
            <option value="1.25">125%</option>
            <option value="1.5">150%</option>
          </select>
        </label>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="pdf-canvas" ref={holder}>
        {rendering && (
          <div className="render-status" role="status">
            Rendering page…
          </div>
        )}
        <canvas
          ref={canvas}
          aria-label={`PDF page ${page}. This viewer displays document pages as images.`}
        />
      </div>
    </div>
  );
}

function VideoViewer({ initialGrant, item }) {
  const video = useRef(null),
    resume = useRef(null);
  const [grant, setGrant] = useState(initialGrant),
    [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(
      async () => {
        try {
          const next = await api(`/api/content/${item.id}/access`, {
            method: "POST",
            body: { recordOpen: false },
          });
          if (cancelled) return;
          resume.current = {
            time: video.current?.currentTime || 0,
            playing: video.current ? !video.current.paused : false,
          };
          setGrant(next);
        } catch (e) {
          if (!cancelled) setError(e.message);
        }
      },
      Math.max(1000, grant.expiresAt - Date.now() - 15000),
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [grant, item.id]);
  return (
    <div className="video-wrap">
      <video
        ref={video}
        src={grant.url}
        controls
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        disableRemotePlayback
        playsInline
        preload="metadata"
        onError={() =>
          setError(
            "Playback failed. Reopen this item to refresh access. MP4 videos should use browser-compatible H.264/AAC encoding.",
          )
        }
        onLoadedMetadata={() => {
          if (resume.current) {
            video.current.currentTime = Math.min(
              resume.current.time,
              video.current.duration || resume.current.time,
            );
            if (resume.current.playing) video.current.play().catch(() => {});
            resume.current = null;
          }
          setError("");
        }}
        aria-label={item.title}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default function ContentViewer({ item, user }) {
  const [grant, setGrant] = useState(null),
    [html, setHtml] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    (async () => {
      try {
        const next = await api(`/api/content/${item.id}/access`, {
          method: "POST",
          body: { recordOpen: true },
          signal: controller.signal,
        });
        if (disposed) return;
        if (item.kind === "html") {
          const response = await fetch(next.url, {
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
          });
          if (response.status === 401)
            window.dispatchEvent(new Event("session-expired"));
          if (!response.ok)
            throw new Error(
              "Could not load this page. Close and reopen it to try again.",
            );
          const text = await response.text();
          if (!disposed) setHtml(text);
        }
        if (!disposed) setGrant(next);
      } catch (e) {
        if (!disposed) setError(e.message);
      }
    })();
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [item.id, item.kind]);
  if (error)
    return (
      <div className="error" role="alert">
        {error}
      </div>
    );
  if (!grant)
    return (
      <div className="loading" role="status">
        <span className="spinner" />
        Opening content…
      </div>
    );
  return (
    <div className="protected-viewer" onContextMenu={(e) => e.preventDefault()}>
      <div className="viewing-label">
        <Icon name="lock" size={14} />
        Internal access<span>{user.email}</span>
      </div>
      {item.kind === "video" ? (
        <VideoViewer item={item} initialGrant={grant} />
      ) : item.kind === "pdf" ? (
        <PdfViewer url={grant.url} />
      ) : (
        <iframe
          className="html-frame"
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={html}
          title={item.title}
        />
      )}
      <p className="viewer-footnote">
        For internal learning and reference. Please respect your organization’s
        content policy.
      </p>
    </div>
  );
}

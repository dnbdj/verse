import { useEffect, useState } from "react";
import { toDataURL } from "qrcode";

type Props = {
  link: string;
  label: string;
};

/** A local QR render — no image service, works offline once the app is installed. */
export function LookQr({ link, label }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setSrc(null);
    setFailed(false);

    void toDataURL(link, {
      margin: 1,
      width: 240,
      errorCorrectionLevel: "M",
      color: { dark: "#0b0b0dff", light: "#ffffffff" },
    })
      .then((data) => {
        if (alive) setSrc(data);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });

    return () => {
      alive = false;
    };
  }, [link]);

  if (failed) {
    return <div className="qr-fallback">QR could not be generated — copy the link instead.</div>;
  }
  if (!src) {
    return <div className="qr-box qr-loading">Rendering QR…</div>;
  }
  return <img className="qr-box" src={src} alt={label} />;
}

import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";

const BG = "#0f172a";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function crop(
  dataUrl: string,
  sx: number,
  sy: number,
  sw: number,
  sh: number
): Promise<string> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(sw));
  canvas.height = Math.max(1, Math.floor(sh));
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas.toDataURL("image/png");
}

async function capture(block: HTMLElement): Promise<{ dataUrl: string; w: number; h: number }> {
  const w = block.scrollWidth || block.clientWidth;
  const h = block.scrollHeight || block.clientHeight;
  const dataUrl = await toPng(block, {
    width: w,
    height: h,
    pixelRatio: 2,
    backgroundColor: BG,
  });
  return { dataUrl, w, h };
}

export async function exportToPdf(title: string, filename: string): Promise<void> {
  const blocks = Array.from(
    document.querySelectorAll<HTMLElement>("[data-export-block], [data-export-table]")
  );
  if (blocks.length === 0) return;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const MARGIN = 10;
  const HEADER = 8;
  const FOOTER = 6;
  const GAP = 6;
  const usableW = pageW - MARGIN * 2;
  const usableH = pageH - MARGIN * 2 - HEADER - FOOTER;

  const fillBg = () => {
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageW, pageH, "F");
  };

  let pageCount = 0;
  let cursorY = 0; // mm from top of content area on the current page
  const newPage = () => {
    if (pageCount > 0) doc.addPage();
    fillBg();
    cursorY = 0;
    pageCount += 1;
  };
  newPage();

  // Draw a full-width block, cropping each slice so the content area (below the
  // reserved header) is never overlaid.
  const placeFlow = async (dataUrl: string, w: number, h: number) => {
    const H = (h / w) * usableW;
    const img = await loadImage(dataUrl);
    const pxPerMm = img.height / H;
    let offsetPx = 0;
    let remaining = H;
    while (remaining > 0) {
      const avail = usableH - cursorY;
      if (avail <= 0) {
        newPage();
        continue;
      }
      const take = Math.min(avail, remaining);
      const first = offsetPx === 0;
      const last = take >= remaining - 1e-6;
      let sliceUrl = dataUrl;
      if (!(first && last)) {
        const shPx = Math.max(1, Math.round(take * pxPerMm));
        sliceUrl = await crop(dataUrl, 0, Math.round(offsetPx), img.width, shPx);
        offsetPx += shPx;
      }
      doc.addImage(sliceUrl, "PNG", MARGIN, MARGIN + HEADER + cursorY, usableW, take);
      cursorY += take;
      remaining -= take;
    }
    cursorY += GAP;
  };

  // A table with a repeatable header. Header is stamped at the top of every page
  // that carries body rows; each body slice is cropped and placed below it.
  const placeTable = async (
    headerDataUrl: string,
    headerHmm: number,
    bodyDataUrl: string,
    bodyHmm: number
  ) => {
    if (headerHmm <= 0) {
      const img = await loadImage(bodyDataUrl);
      const w = img.width;
      const h = img.height;
      await placeFlow(bodyDataUrl, w, h);
      return;
    }
    const bodyImg = await loadImage(bodyDataUrl);
    const pxPerMm = bodyImg.height / bodyHmm;
    let offsetPx = 0;
    let remaining = bodyHmm;
    while (remaining > 0) {
      const avail = usableH - cursorY;
      if (avail <= headerHmm + 2) {
        newPage();
        continue;
      }
      const take = Math.min(avail - headerHmm, remaining);
      doc.addImage(headerDataUrl, "PNG", MARGIN, MARGIN + HEADER + cursorY, usableW, headerHmm);
      const first = offsetPx === 0;
      const last = take >= remaining - 1e-6;
      let sliceUrl = bodyDataUrl;
      if (!(first && last)) {
        const shPx = Math.max(1, Math.round(take * pxPerMm));
        sliceUrl = await crop(bodyDataUrl, 0, Math.round(offsetPx), bodyImg.width, shPx);
        offsetPx += shPx;
      }
      doc.addImage(
        sliceUrl,
        "PNG",
        MARGIN,
        MARGIN + HEADER + cursorY + headerHmm,
        usableW,
        take
      );
      cursorY += headerHmm + take;
      remaining -= take;
    }
    cursorY += GAP;
  };

  for (const block of blocks) {
    const isTable = block.hasAttribute("data-export-table");
    const keep = block.hasAttribute("data-export-keep");

    if (!isTable) {
      let shot: { dataUrl: string; w: number; h: number };
      try {
        shot = await capture(block);
      } catch (err) {
        console.error("Failed to capture export block", err);
        continue;
      }
      const H = (shot.h / shot.w) * usableW;
      if (keep && H <= usableH && cursorY + H > usableH) newPage();
      await placeFlow(shot.dataUrl, shot.w, shot.h);
      continue;
    }

    // Table block: split header (repeated) from body (sliced).
    const headEl = block.querySelector<HTMLElement>("[data-export-head]");
    let full: { dataUrl: string; w: number; h: number };
    try {
      full = await capture(block);
    } catch (err) {
      console.error("Failed to capture export table", err);
      continue;
    }
    const img = await loadImage(full.dataUrl);
    const scale = img.width / full.w;

    let headerDataUrl = full.dataUrl;
    let bodyDataUrl = full.dataUrl;
    let headBottomPx = 0;

    if (headEl) {
      const blockRect = block.getBoundingClientRect();
      const headRect = headEl.getBoundingClientRect();
      headBottomPx = Math.min(full.h, Math.max(0, headRect.bottom - blockRect.top));
      headerDataUrl = await crop(full.dataUrl, 0, 0, img.width, headBottomPx * scale);
      bodyDataUrl = await crop(
        full.dataUrl,
        0,
        headBottomPx * scale,
        img.width,
        (full.h - headBottomPx) * scale
      );
    }

    const headerHmm = (headBottomPx / full.w) * usableW;
    const bodyHmm = ((full.h - headBottomPx) / full.w) * usableW;
    await placeTable(headerDataUrl, headerHmm, bodyDataUrl, bodyHmm);
  }

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text(title, MARGIN, MARGIN + 4);
    doc.text(`Page ${i} of ${total}`, pageW - MARGIN, pageH - MARGIN + 2, { align: "right" });
  }

  doc.save(filename);
}

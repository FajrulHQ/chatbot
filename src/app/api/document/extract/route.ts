import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";

    let fileName = "document.txt";
    let fileBuffer: ArrayBuffer | null = null;
    let mimeType = "text/plain";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
      }
      fileName = file.name;
      mimeType = file.type || "application/octet-stream";
      fileBuffer = await file.arrayBuffer();
    } else {
      const body = (await request.json().catch(() => null)) as {
        dataUrl?: string;
        fileName?: string;
        mimeType?: string;
      } | null;

      if (!body || !body.dataUrl) {
        return NextResponse.json({ error: "dataUrl or file required." }, { status: 400 });
      }

      fileName = body.fileName || "document";
      const match = body.dataUrl.match(/^data:([^;]+);base64,(.*)$/);
      if (match) {
        mimeType = match[1];
        const binary = Buffer.from(match[2], "base64");
        fileBuffer = binary.buffer.slice(
          binary.byteOffset,
          binary.byteOffset + binary.byteLength
        );
      } else {
        fileBuffer = new TextEncoder().encode(body.dataUrl).buffer;
      }
    }

    if (!fileBuffer) {
      return NextResponse.json({ error: "Failed to read file buffer." }, { status: 400 });
    }

    let extractedText = "";
    const isPdf =
      fileName.toLowerCase().endsWith(".pdf") || mimeType.includes("pdf");

    if (isPdf) {
      try {
        const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
        const loadingTask = pdfjs.getDocument({
          data: new Uint8Array(fileBuffer),
          useSystemFonts: true,
          disableFontFace: true,
        });
        const doc = await loadingTask.promise;
        const numPages = doc.numPages;
        const pageTexts: string[] = [];

        for (let i = 1; i <= Math.min(numPages, 60); i++) {
          const page = await doc.getPage(i);
          const textContent = await page.getTextContent();
          const pageStr = textContent.items
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((item: any) => item.str || "")
            .join(" ");
          pageTexts.push(`[Page ${i}]\n${pageStr.trim()}`);
        }
        extractedText = pageTexts.join("\n\n");
      } catch (pdfErr) {
        console.warn("pdfjs extraction failed, attempting raw text decode:", pdfErr);
        extractedText = new TextDecoder("utf-8", { fatal: false }).decode(
          new Uint8Array(fileBuffer)
        );
      }
    } else {
      // Plain text, Markdown, CSV, JSON, Source Code
      extractedText = new TextDecoder("utf-8", { fatal: false }).decode(
        new Uint8Array(fileBuffer)
      );
    }

    const trimmed = extractedText.trim();
    const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
    const charCount = trimmed.length;

    return NextResponse.json({
      success: true,
      fileName,
      mimeType,
      charCount,
      wordCount,
      text: trimmed,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Extraction error: ${msg}` }, { status: 500 });
  }
}
